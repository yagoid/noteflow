"use strict";
// SPIKE (throwaway prototype, not a shipped feature): inline AI autocomplete through the
// managed NoteFlow AI proxy. One short streamed /chat/completions request per suggestion.
// Benchmarked by scripts/spike-autocomplete-bench.cjs (same request shape; the prompt here
// additionally asks the model to echo the last word — see ECHO below).
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTOCOMPLETE_AFTER_CHARS = exports.AUTOCOMPLETE_BEFORE_CHARS = void 0;
exports.cleanSuggestion = cleanSuggestion;
exports.completeText = completeText;
/** Context sent with each request (characters of plain text around the caret). */
exports.AUTOCOMPLETE_BEFORE_CHARS = 1500;
exports.AUTOCOMPLETE_AFTER_CHARS = 200;
// Same prompt as the benchmark. An earlier variant asked the model to echo the last word
// (to make the word boundary explicit): measured, it made Haiku spend the whole token cap
// reasoning half the time and put a blank line after the echo the rest — always empty.
// cleanSuggestion still strips an echo if one shows up and fixes the leading space.
const SYSTEM = [
    'You are an inline autocomplete engine inside a note-taking app.',
    'Continue the user\'s text from the exact position marked <CURSOR/>.',
    'Reply with ONLY the continuation, and keep it SHORT: the next 3 to 10 words, just enough to finish the current clause or list item, in the same language and tone as the text.',
    'Answer immediately, without thinking it through.',
    'Never repeat text that is already written, never explain, never use quotes or markdown fences.',
    'If the text before the cursor ends in the middle of a word, finish that word; otherwise start with a space when one is needed.',
    'Do not run into the text after the cursor.',
].join(' ');
/**
 * Output cap per model. The proxy drops the client's `reasoning` knob, and DeepSeek
 * reasons before answering (measured: ~85 reasoning tokens on average, up to ~210), so
 * a tight cap comes back EMPTY — it needs room for reasoning + the sentence.
 */
function maxTokensFor(model) {
    return model.startsWith('deepseek/') ? 400 : Number(process.env.NF_SPIKE_MAX_TOKENS) || 64;
}
const WORD_END = /[\p{L}\p{N},;:.!?)\]"”»]$/u;
const WORD_START = /^[\p{L}\p{N}¿¡(["“«]/u;
/**
 * Turns the model's raw reply into the text to insert at the caret: first line only,
 * echo of the text before the cursor removed (longest suffix of the current line that
 * starts at a word boundary and prefixes the reply), spacing fixed, and a reply cut
 * by the token cap trimmed back to its last whole word.
 */
function cleanSuggestion(before, raw, finishReason) {
    let text = raw.replace(/<CURSOR\/>/g, '').replace(/^\s*\n/, '');
    const nl = text.indexOf('\n');
    if (nl >= 0)
        text = text.slice(0, nl);
    text = text.trimEnd();
    if (!text.trim())
        return '';
    const endsWithSpace = before === '' || /\s$/.test(before);
    const line = before.slice(before.lastIndexOf('\n') + 1).trimEnd();
    const reply = text.trimStart();
    let rest = null;
    for (let i = 0; i < line.length; i++) {
        if (i > 0 && !/\s/.test(line[i - 1]))
            continue;
        if (/\s/.test(line[i]))
            continue;
        const suffix = line.slice(i);
        if (reply.startsWith(suffix)) {
            rest = reply.slice(suffix.length);
            break;
        }
    }
    let out;
    if (rest !== null) {
        out = endsWithSpace ? rest.trimStart() : rest;
    }
    else if (endsWithSpace) {
        out = reply;
    }
    else if (text !== reply) {
        out = text; // the model sent its own leading space
    }
    else {
        out = WORD_END.test(before) && WORD_START.test(reply) ? ` ${reply}` : reply;
    }
    if (finishReason === 'length') {
        const cut = out.search(/\s+\S*$/);
        if (cut > 0)
            out = out.slice(0, cut);
    }
    out = shorten(out.trimEnd());
    return out.trim() ? out : '';
}
/** Max words shown. Longer replies are cut at the last clause boundary inside the cap. */
const MAX_WORDS = 12;
function shorten(text) {
    const words = text.match(/\s*\S+/g) ?? [];
    if (words.length <= MAX_WORDS)
        return text;
    const capped = words.slice(0, MAX_WORDS).join('');
    // Prefer ending on punctuation (after at least 4 words) over a hard word cut.
    let best = -1;
    for (const hit of capped.matchAll(/[,;:.!?](?=\s|$)/g))
        best = hit.index + 1;
    return best > 0 && capped.slice(0, best).trim().split(/\s+/).length >= 4 ? capped.slice(0, best) : capped;
}
/** One streamed completion. Throws `HTTP <status> <code>` on a rejected request. */
async function completeText(opts) {
    const before = opts.before.slice(-exports.AUTOCOMPLETE_BEFORE_CHARS);
    const after = opts.after.slice(0, exports.AUTOCOMPLETE_AFTER_CHARS);
    const t0 = Date.now();
    const res = await fetch(`${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.token}` },
        body: JSON.stringify({
            model: opts.model,
            stream: true,
            max_tokens: maxTokensFor(opts.model),
            temperature: 0.2,
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: `${before}<CURSOR/>${after}` },
            ],
        }),
        signal: opts.signal,
    });
    if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '');
        let code = '';
        try {
            code = String(JSON.parse(detail).error?.code ?? '');
        }
        catch { /* not JSON */ }
        throw new Error(`HTTP ${res.status}${code ? ` ${code}` : ''}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let raw = '';
    let ttftMs = null;
    let finishReason = null;
    let reasoned = false;
    let finished = false;
    try {
        while (!finished) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buf += decoder.decode(value, { stream: true });
            let nl;
            while ((nl = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (!line.startsWith('data:'))
                    continue;
                const data = line.slice(5).trim();
                if (data === '[DONE]') {
                    finished = true;
                    break;
                }
                let json;
                try {
                    json = JSON.parse(data);
                }
                catch {
                    continue;
                }
                if (json.error)
                    throw new Error(`Stream error ${String(json.error.code ?? '')}`);
                const choice = json.choices?.[0];
                if (!choice)
                    continue;
                if (choice.finish_reason)
                    finishReason = choice.finish_reason;
                if (choice.delta?.reasoning)
                    reasoned = true;
                if (choice.delta?.content) {
                    if (ttftMs === null)
                        ttftMs = Date.now() - t0;
                    raw += choice.delta.content;
                }
            }
        }
    }
    catch (err) {
        void reader.cancel().catch(() => { });
        throw err;
    }
    return { text: cleanSuggestion(before, raw, finishReason), ms: Date.now() - t0, ttftMs, finishReason, reasoned };
}
