(()=>{var OA=Object.create;var M_=Object.defineProperty;var IA=Object.getOwnPropertyDescriptor;var PA=Object.getOwnPropertyNames;var zA=Object.getPrototypeOf,BA=Object.prototype.hasOwnProperty;var gn=(e,t,n)=>()=>{if(n)throw n[0];try{return e&&(t=e(e=0)),t}catch(i){throw n=[i],i}};var ls=(e,t)=>()=>{try{return t||e((t={exports:{}}).exports,t),t.exports}catch(n){throw t=0,n}};var FA=(e,t,n,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let s of PA(t))!BA.call(e,s)&&s!==n&&M_(e,s,{get:()=>t[s],enumerable:!(i=IA(t,s))||i.enumerable});return e};var Uo=(e,t,n)=>(n=e!=null?OA(zA(e)):{},FA(t||!e||!e.__esModule?M_(n,"default",{value:e,enumerable:!0}):n,e));var P_=ls(le=>{"use strict";var bp=Symbol.for("react.transitional.element"),HA=Symbol.for("react.portal"),VA=Symbol.for("react.fragment"),GA=Symbol.for("react.strict_mode"),kA=Symbol.for("react.profiler"),XA=Symbol.for("react.consumer"),WA=Symbol.for("react.context"),qA=Symbol.for("react.forward_ref"),YA=Symbol.for("react.suspense"),ZA=Symbol.for("react.memo"),R_=Symbol.for("react.lazy"),KA=Symbol.for("react.activity"),jA=Symbol.for("react.view_transition"),E_=Symbol.iterator;function QA(e){return e===null||typeof e!="object"?null:(e=E_&&e[E_]||e["@@iterator"],typeof e=="function"?e:null)}var C_={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},D_=Object.assign,N_={};function Oo(e,t,n){this.props=e,this.context=t,this.refs=N_,this.updater=n||C_}Oo.prototype.isReactComponent={};Oo.prototype.setState=function(e,t){if(typeof e!="object"&&typeof e!="function"&&e!=null)throw Error("takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,e,t,"setState")};Oo.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,"forceUpdate")};function U_(){}U_.prototype=Oo.prototype;function Sp(e,t,n){this.props=e,this.context=t,this.refs=N_,this.updater=n||C_}var Mp=Sp.prototype=new U_;Mp.constructor=Sp;D_(Mp,Oo.prototype);Mp.isPureReactComponent=!0;var T_=Array.isArray;function xp(){}var Qe={H:null,A:null,T:null,S:null},L_=Object.prototype.hasOwnProperty;function Ep(e,t,n){var i=n.ref;return{$$typeof:bp,type:e,key:t,ref:i!==void 0?i:null,props:n}}function JA(e,t){return Ep(e.type,t,e.props)}function Tp(e){return typeof e=="object"&&e!==null&&e.$$typeof===bp}function $A(e){var t={"=":"=0",":":"=2"};return"$"+e.replace(/[=:]/g,function(n){return t[n]})}var A_=/\/+/g;function _p(e,t){return typeof e=="object"&&e!==null&&e.key!=null?$A(""+e.key):t.toString(36)}function tw(e){switch(e.status){case"fulfilled":return e.value;case"rejected":throw e.reason;default:switch(typeof e.status=="string"?e.then(xp,xp):(e.status="pending",e.then(function(t){e.status==="pending"&&(e.status="fulfilled",e.value=t)},function(t){e.status==="pending"&&(e.status="rejected",e.reason=t)})),e.status){case"fulfilled":return e.value;case"rejected":throw e.reason}}throw e}function Lo(e,t,n,i,s){var a=typeof e;(a==="undefined"||a==="boolean")&&(e=null);var r=!1;if(e===null)r=!0;else switch(a){case"bigint":case"string":case"number":r=!0;break;case"object":switch(e.$$typeof){case bp:case HA:r=!0;break;case R_:return r=e._init,Lo(r(e._payload),t,n,i,s)}}if(r)return s=s(e),r=i===""?"."+_p(e,0):i,T_(s)?(n="",r!=null&&(n=r.replace(A_,"$&/")+"/"),Lo(s,t,n,"",function(c){return c})):s!=null&&(Tp(s)&&(s=JA(s,n+(s.key==null||e&&e.key===s.key?"":(""+s.key).replace(A_,"$&/")+"/")+r)),t.push(s)),1;r=0;var o=i===""?".":i+":";if(T_(e))for(var l=0;l<e.length;l++)i=e[l],a=o+_p(i,l),r+=Lo(i,t,n,a,s);else if(l=QA(e),typeof l=="function")for(e=l.call(e),l=0;!(i=e.next()).done;)i=i.value,a=o+_p(i,l++),r+=Lo(i,t,n,a,s);else if(a==="object"){if(typeof e.then=="function")return Lo(tw(e),t,n,i,s);throw t=String(e),Error("Objects are not valid as a React child (found: "+(t==="[object Object]"?"object with keys {"+Object.keys(e).join(", ")+"}":t)+"). If you meant to render a collection of children, use an array instead.")}return r}function Ju(e,t,n){if(e==null)return e;var i=[],s=0;return Lo(e,i,"","",function(a){return t.call(n,a,s++)}),i}function ew(e){if(e._status===-1){var t=e._result,n=t();n.then(function(i){(e._status===0||e._status===-1)&&(e._status=1,e._result=i,n.status===void 0&&(n.status="fulfilled",n.value=i))},function(i){(e._status===0||e._status===-1)&&(e._status=2,e._result=i,n.status===void 0&&(n.status="rejected",n.reason=i))}),e._status===-1&&(e._status=0,e._result=n)}if(e._status===1)return e._result.default;throw e._result}var w_=typeof reportError=="function"?reportError:function(e){if(typeof window=="object"&&typeof window.ErrorEvent=="function"){var t=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:typeof e=="object"&&e!==null&&typeof e.message=="string"?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process=="object"&&typeof process.emit=="function"){process.emit("uncaughtException",e);return}console.error(e)};function O_(e){var t=Qe.T,n={};n.types=t!==null?t.types:null,Qe.T=n;try{var i=e(),s=Qe.S;s!==null&&s(n,i),typeof i=="object"&&i!==null&&typeof i.then=="function"&&i.then(xp,w_)}catch(a){w_(a)}finally{t!==null&&n.types!==null&&(t.types=n.types),Qe.T=t}}function I_(e){var t=Qe.T;if(t!==null){var n=t.types;n===null?t.types=[e]:n.indexOf(e)===-1&&n.push(e)}else O_(I_.bind(null,e))}var nw={map:Ju,forEach:function(e,t,n){Ju(e,function(){t.apply(this,arguments)},n)},count:function(e){var t=0;return Ju(e,function(){t++}),t},toArray:function(e){return Ju(e,function(t){return t})||[]},only:function(e){if(!Tp(e))throw Error("React.Children.only expected to receive a single React element child.");return e}};le.Activity=KA;le.Children=nw;le.Component=Oo;le.Fragment=VA;le.Profiler=kA;le.PureComponent=Sp;le.StrictMode=GA;le.Suspense=YA;le.ViewTransition=jA;le.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=Qe;le.__COMPILER_RUNTIME={__proto__:null,c:function(e){return Qe.H.useMemoCache(e)}};le.addTransitionType=I_;le.cache=function(e){return function(){return e.apply(null,arguments)}};le.cacheSignal=function(){return null};le.cloneElement=function(e,t,n){if(e==null)throw Error("The argument must be a React element, but you passed "+e+".");var i=D_({},e.props),s=e.key;if(t!=null)for(a in t.key!==void 0&&(s=""+t.key),t)!L_.call(t,a)||a==="key"||a==="__self"||a==="__source"||a==="ref"&&t.ref===void 0||(i[a]=t[a]);var a=arguments.length-2;if(a===1)i.children=n;else if(1<a){for(var r=Array(a),o=0;o<a;o++)r[o]=arguments[o+2];i.children=r}return Ep(e.type,s,i)};le.createContext=function(e){return e={$$typeof:WA,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null},e.Provider=e,e.Consumer={$$typeof:XA,_context:e},e};le.createElement=function(e,t,n){var i,s={},a=null;if(t!=null)for(i in t.key!==void 0&&(a=""+t.key),t)L_.call(t,i)&&i!=="key"&&i!=="__self"&&i!=="__source"&&(s[i]=t[i]);var r=arguments.length-2;if(r===1)s.children=n;else if(1<r){for(var o=Array(r),l=0;l<r;l++)o[l]=arguments[l+2];s.children=o}if(e&&e.defaultProps)for(i in r=e.defaultProps,r)s[i]===void 0&&(s[i]=r[i]);return Ep(e,a,s)};le.createRef=function(){return{current:null}};le.forwardRef=function(e){return{$$typeof:qA,render:e}};le.isValidElement=Tp;le.lazy=function(e){return{$$typeof:R_,_payload:{_status:-1,_result:e},_init:ew}};le.memo=function(e,t){return{$$typeof:ZA,type:e,compare:t===void 0?null:t}};le.startTransition=O_;le.unstable_useCacheRefresh=function(){return Qe.H.useCacheRefresh()};le.use=function(e){return Qe.H.use(e)};le.useActionState=function(e,t,n){return Qe.H.useActionState(e,t,n)};le.useCallback=function(e,t){return Qe.H.useCallback(e,t)};le.useContext=function(e){return Qe.H.useContext(e)};le.useDebugValue=function(){};le.useDeferredValue=function(e,t){return Qe.H.useDeferredValue(e,t)};le.useEffect=function(e,t){return Qe.H.useEffect(e,t)};le.useEffectEvent=function(e){return Qe.H.useEffectEvent(e)};le.useId=function(){return Qe.H.useId()};le.useImperativeHandle=function(e,t,n){return Qe.H.useImperativeHandle(e,t,n)};le.useInsertionEffect=function(e,t){return Qe.H.useInsertionEffect(e,t)};le.useLayoutEffect=function(e,t){return Qe.H.useLayoutEffect(e,t)};le.useMemo=function(e,t){return Qe.H.useMemo(e,t)};le.useOptimistic=function(e,t){return Qe.H.useOptimistic(e,t)};le.useReducer=function(e,t,n){return Qe.H.useReducer(e,t,n)};le.useRef=function(e){return Qe.H.useRef(e)};le.useState=function(e){return Qe.H.useState(e)};le.useSyncExternalStore=function(e,t,n){return Qe.H.useSyncExternalStore(e,t,n)};le.useTransition=function(){return Qe.H.useTransition()};le.version="19.3.1"});var Io=ls((pI,z_)=>{"use strict";z_.exports=P_()});var Y_=ls(an=>{"use strict";function Cp(e,t){var n=e.length;e.push(t);t:for(;0<n;){var i=n-1>>>1,s=e[i];if(0<$u(s,t))e[i]=t,e[n]=s,n=i;else break t}}function Cs(e){return e.length===0?null:e[0]}function eh(e){if(e.length===0)return null;var t=e[0],n=e.pop();if(n!==t){e[0]=n;t:for(var i=0,s=e.length,a=s>>>1;i<a;){var r=2*(i+1)-1,o=e[r],l=r+1,c=e[l];if(0>$u(o,n))l<s&&0>$u(c,o)?(e[i]=c,e[l]=n,i=l):(e[i]=o,e[r]=n,i=r);else if(l<s&&0>$u(c,n))e[i]=c,e[l]=n,i=l;else break t}}return t}function $u(e,t){var n=e.sortIndex-t.sortIndex;return n!==0?n:e.id-t.id}an.unstable_now=void 0;typeof performance=="object"&&typeof performance.now=="function"?(B_=performance,an.unstable_now=function(){return B_.now()}):(Ap=Date,F_=Ap.now(),an.unstable_now=function(){return Ap.now()-F_});var B_,Ap,F_,ia=[],Fa=[],iw=1,qi=null,Qn=3,Dp=!1,Sc=!1,Mc=!1,Np=!1,G_=typeof setTimeout=="function"?setTimeout:null,k_=typeof clearTimeout=="function"?clearTimeout:null,H_=typeof setImmediate<"u"?setImmediate:null;function th(e){for(var t=Cs(Fa);t!==null;){if(t.callback===null)eh(Fa);else if(t.startTime<=e)eh(Fa),t.sortIndex=t.expirationTime,Cp(ia,t);else break;t=Cs(Fa)}}function Up(e){if(Mc=!1,th(e),!Sc)if(Cs(ia)!==null)Sc=!0,zo||(zo=!0,Po());else{var t=Cs(Fa);t!==null&&Lp(Up,t.startTime-e)}}var zo=!1,Ec=-1,X_=5,W_=-1;function q_(){return Np?!0:!(an.unstable_now()-W_<X_)}function wp(){if(Np=!1,zo){var e=an.unstable_now();W_=e;var t=!0;try{t:{Sc=!1,Mc&&(Mc=!1,k_(Ec),Ec=-1),Dp=!0;var n=Qn;try{e:{for(th(e),qi=Cs(ia);qi!==null&&!(qi.expirationTime>e&&q_());){var i=qi.callback;if(typeof i=="function"){qi.callback=null,Qn=qi.priorityLevel;var s=i(qi.expirationTime<=e);if(e=an.unstable_now(),typeof s=="function"){qi.callback=s,th(e),t=!0;break e}qi===Cs(ia)&&eh(ia),th(e)}else eh(ia);qi=Cs(ia)}if(qi!==null)t=!0;else{var a=Cs(Fa);a!==null&&Lp(Up,a.startTime-e),t=!1}}break t}finally{qi=null,Qn=n,Dp=!1}t=void 0}}finally{t?Po():zo=!1}}}var Po;typeof H_=="function"?Po=function(){H_(wp)}:typeof MessageChannel<"u"?(Rp=new MessageChannel,V_=Rp.port2,Rp.port1.onmessage=wp,Po=function(){V_.postMessage(null)}):Po=function(){G_(wp,0)};var Rp,V_;function Lp(e,t){Ec=G_(function(){e(an.unstable_now())},t)}an.unstable_IdlePriority=5;an.unstable_ImmediatePriority=1;an.unstable_LowPriority=4;an.unstable_NormalPriority=3;an.unstable_Profiling=null;an.unstable_UserBlockingPriority=2;an.unstable_cancelCallback=function(e){e.callback=null};an.unstable_forceFrameRate=function(e){0>e||125<e?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):X_=0<e?Math.floor(1e3/e):5};an.unstable_getCurrentPriorityLevel=function(){return Qn};an.unstable_next=function(e){switch(Qn){case 1:case 2:case 3:var t=3;break;default:t=Qn}var n=Qn;Qn=t;try{return e()}finally{Qn=n}};an.unstable_requestPaint=function(){Np=!0};an.unstable_runWithPriority=function(e,t){switch(e){case 1:case 2:case 3:case 4:case 5:break;default:e=3}var n=Qn;Qn=e;try{return t()}finally{Qn=n}};an.unstable_scheduleCallback=function(e,t,n){var i=an.unstable_now();switch(typeof n=="object"&&n!==null?(n=n.delay,n=typeof n=="number"&&0<n?i+n:i):n=i,e){case 1:var s=-1;break;case 2:s=250;break;case 5:s=1073741823;break;case 4:s=1e4;break;default:s=5e3}return s=n+s,e={id:iw++,callback:t,priorityLevel:e,startTime:n,expirationTime:s,sortIndex:-1},n>i?(e.sortIndex=n,Cp(Fa,e),Cs(ia)===null&&e===Cs(Fa)&&(Mc?(k_(Ec),Ec=-1):Mc=!0,Lp(Up,n-i))):(e.sortIndex=s,Cp(ia,e),Sc||Dp||(Sc=!0,zo||(zo=!0,Po()))),e};an.unstable_shouldYield=q_;an.unstable_wrapCallback=function(e){var t=Qn;return function(){var n=Qn;Qn=t;try{return e.apply(this,arguments)}finally{Qn=n}}}});var K_=ls((gI,Z_)=>{"use strict";Z_.exports=Y_()});var J_=ls(Jn=>{"use strict";var sw=Io();function Q_(e){var t="https://react.dev/errors/"+e;if(1<arguments.length){t+="?args[]="+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)t+="&args[]="+encodeURIComponent(arguments[n])}return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}function Ha(){}var li={d:{f:Ha,r:function(){throw Error(Q_(522))},D:Ha,C:Ha,L:Ha,m:Ha,X:Ha,S:Ha,M:Ha},p:0,findDOMNode:null},aw=Symbol.for("react.portal"),rw=Symbol.for("react.recoverable"),j_=Symbol.for("react.optimistic_key");function ow(e,t,n){var i=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:aw,key:i==null?null:i===j_?j_:""+i,children:e,containerInfo:t,implementation:n}}var Tc=sw.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;function nh(e,t){if(e==="font")return"";if(typeof t=="string")return t==="use-credentials"?t:""}Jn.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=li;Jn.browser=function(e){return{$$typeof:rw,_reason:e}};Jn.createPortal=function(e,t){var n=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!t||t.nodeType!==1&&t.nodeType!==9&&t.nodeType!==11)throw Error(Q_(299));return ow(e,t,null,n)};Jn.flushSync=function(e){var t=Tc.T,n=li.p;try{if(Tc.T=null,li.p=2,e)return e()}finally{Tc.T=t,li.p=n,li.d.f()}};Jn.preconnect=function(e,t){typeof e=="string"&&(t?(t=t.crossOrigin,t=typeof t=="string"?t==="use-credentials"?t:"":void 0):t=null,li.d.C(e,t))};Jn.prefetchDNS=function(e){typeof e=="string"&&li.d.D(e)};Jn.preinit=function(e,t){if(typeof e=="string"&&t&&typeof t.as=="string"){var n=t.as,i=nh(n,t.crossOrigin),s=typeof t.integrity=="string"?t.integrity:void 0,a=typeof t.fetchPriority=="string"?t.fetchPriority:void 0;n==="style"?li.d.S(e,typeof t.precedence=="string"?t.precedence:void 0,{crossOrigin:i,integrity:s,fetchPriority:a}):n==="script"&&li.d.X(e,{crossOrigin:i,integrity:s,fetchPriority:a,nonce:typeof t.nonce=="string"?t.nonce:void 0})}};Jn.preinitModule=function(e,t){if(typeof e=="string")if(typeof t=="object"&&t!==null){if(t.as==null||t.as==="script"){var n=nh(t.as,t.crossOrigin);li.d.M(e,{crossOrigin:n,integrity:typeof t.integrity=="string"?t.integrity:void 0,nonce:typeof t.nonce=="string"?t.nonce:void 0,fetchPriority:typeof t.fetchPriority=="string"?t.fetchPriority:void 0})}}else t==null&&li.d.M(e)};Jn.preload=function(e,t){if(typeof e=="string"&&typeof t=="object"&&t!==null&&typeof t.as=="string"){var n=t.as,i=nh(n,t.crossOrigin);li.d.L(e,n,{crossOrigin:i,integrity:typeof t.integrity=="string"?t.integrity:void 0,nonce:typeof t.nonce=="string"?t.nonce:void 0,type:typeof t.type=="string"?t.type:void 0,fetchPriority:typeof t.fetchPriority=="string"?t.fetchPriority:void 0,referrerPolicy:typeof t.referrerPolicy=="string"?t.referrerPolicy:void 0,imageSrcSet:typeof t.imageSrcSet=="string"?t.imageSrcSet:void 0,imageSizes:typeof t.imageSizes=="string"?t.imageSizes:void 0,media:typeof t.media=="string"?t.media:void 0})}};Jn.preloadModule=function(e,t){if(typeof e=="string")if(t){var n=nh(t.as,t.crossOrigin);li.d.m(e,{as:typeof t.as=="string"&&t.as!=="script"?t.as:void 0,crossOrigin:n,integrity:typeof t.integrity=="string"?t.integrity:void 0,nonce:typeof t.nonce=="string"?t.nonce:void 0,fetchPriority:typeof t.fetchPriority=="string"?t.fetchPriority:void 0})}else li.d.m(e)};Jn.requestFormReset=function(e){li.d.r(e)};Jn.unstable_batchedUpdates=function(e,t){return e(t)};Jn.useFormState=function(e,t,n){return Tc.H.useFormState(e,t,n)};Jn.useFormStatus=function(){return Tc.H.useHostTransitionStatus()};Jn.version="19.3.1"});var ex=ls((yI,tx)=>{"use strict";function $_(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE($_)}catch(e){console.error(e)}}$_(),tx.exports=J_()});var VM=ls(Bf=>{"use strict";var wn=K_(),H1=Io(),lw=ex();function at(e){var t="https://react.dev/errors/"+e;if(1<arguments.length){t+="?args[]="+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)t+="&args[]="+encodeURIComponent(arguments[n])}return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}function V1(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function fu(e){for(var t=e,n=t;n&&!n.alternate;)t=n,(t.flags&4098)!==0&&(e=t.return),n=t.return;for(;t.return;)t=t.return;return t.tag===3?e:null}function G1(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function k1(e){if(e.tag===31){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function nx(e){if(fu(e)!==e)throw Error(at(188))}function cw(e){var t=e.alternate;if(!t){if(t=fu(e),t===null)throw Error(at(188));return t!==e?null:e}for(var n=e,i=t;;){var s=n.return;if(s===null)break;var a=s.alternate;if(a===null){if(i=s.return,i!==null){n=i;continue}break}if(s.child===a.child){for(a=s.child;a;){if(a===n)return nx(s),e;if(a===i)return nx(s),t;a=a.sibling}throw Error(at(188))}if(n.return!==i.return)n=s,i=a;else{for(var r=!1,o=s.child;o;){if(o===n){r=!0,n=s,i=a;break}if(o===i){r=!0,i=s,n=a;break}o=o.sibling}if(!r){for(o=a.child;o;){if(o===n){r=!0,n=a,i=s;break}if(o===i){r=!0,i=a,n=s;break}o=o.sibling}if(!r)throw Error(at(189))}}if(n.alternate!==i)throw Error(at(190))}if(n.tag!==3)throw Error(at(188));return n.stateNode.current===n?e:t}function X1(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e;for(e=e.child;e!==null;){if(t=X1(e),t!==null)return t;e=e.sibling}return null}function Mi(e,t,n,i,s,a){for(;e!==null;){if((e.tag===5||e.tag===27||e.tag===6)&&n(e,i,s,a)||(e.tag!==22||e.memoizedState===null)&&(t||e.tag!==5&&e.tag!==27)&&Mi(e.child,t,n,i,s,a))return!0;e=e.sibling}return!1}function Zr(e){for(e=e.return;e!==null;){if(e.tag===3||e.tag===5||e.tag===27)return e;e=e.return}return null}function ix(e){var t=!1;for(e=e.return;e!==null&&(e.tag===4&&(t=!0),!(e.tag===3||e.tag===5||e.tag===27));)e=e.return;return t}function W1(e){var t=[null,null],n=Zr(e);return n===null||q1(t,e,n.child,{foundSelf:!1}),t}function q1(e,t,n,i){for(;n!==null;){if(n===t)i.foundSelf=!0;else if(n.tag===5||n.tag===27||n.tag===6){if(i.foundSelf)return e[1]=n,!0;e[0]=n}else if((n.tag!==22||n.memoizedState===null)&&q1(e,t,n.child,i))return!0;n=n.sibling}return!1}function An(e){switch(e.tag){case 5:case 27:case 6:return e.stateNode;case 3:return e.stateNode.containerInfo;default:throw Error(at(559))}}var Xo=null,hm=null;function uw(e,t,n){return e===n?!0:e===t?(Xo=e,!0):!1}function hw(e,t,n){return e===n?(hm=e,!1):e===t?(hm!==null&&(Xo=e),!0):!1}function sx(e){if(e===null)return null;do e=e===null?null:e.return;while(e&&e.tag!==5&&e.tag!==27&&e.tag!==3);return e||null}function fm(e,t,n){for(var i=0,s=e;s;s=n(s))i++;s=0;for(var a=t;a;a=n(a))s++;for(;0<i-s;)e=n(e),i--;for(;0<s-i;)t=n(t),s--;for(;i--;){if(e===t||t!==null&&e===t.alternate)return e;e=n(e),t=n(t)}return null}var je=Object.assign,fw=Symbol.for("react.element"),ih=Symbol.for("react.transitional.element"),Uc=Symbol.for("react.portal"),Wo=Symbol.for("react.fragment"),Y1=Symbol.for("react.strict_mode"),dm=Symbol.for("react.profiler"),Z1=Symbol.for("react.consumer"),Is=Symbol.for("react.context"),S0=Symbol.for("react.forward_ref"),pm=Symbol.for("react.suspense"),mm=Symbol.for("react.suspense_list"),M0=Symbol.for("react.memo"),Xa=Symbol.for("react.lazy"),gm=Symbol.for("react.activity"),dw=Symbol.for("react.legacy_hidden"),pw=Symbol.for("react.memo_cache_sentinel"),vm=Symbol.for("react.view_transition"),mw=Symbol.for("react.recoverable"),ax=Symbol.iterator;function Ac(e){return e===null||typeof e!="object"?null:(e=ax&&e[ax]||e["@@iterator"],typeof e=="function"?e:null)}var gw=Symbol.for("react.client.reference");function ym(e){if(e==null)return null;if(typeof e=="function")return e.$$typeof===gw?null:e.displayName||e.name||null;if(typeof e=="string")return e;switch(e){case Wo:return"Fragment";case dm:return"Profiler";case Y1:return"StrictMode";case pm:return"Suspense";case mm:return"SuspenseList";case gm:return"Activity";case vm:return"ViewTransition"}if(typeof e=="object")switch(e.$$typeof){case Uc:return"Portal";case Is:return e.displayName||"Context";case Z1:return(e._context.displayName||"Context")+".Consumer";case S0:var t=e.render;return e=e.displayName,e||(e=t.displayName||t.name||"",e=e!==""?"ForwardRef("+e+")":"ForwardRef"),e;case M0:return t=e.displayName||null,t!==null?t:ym(e.type)||"Memo";case Xa:t=e._payload,e=e._init;try{return ym(e(t))}catch{}}return null}var Lc=Array.isArray,se=H1.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,Le=lw.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,Ir={pending:!1,data:null,method:null,action:null},_m=[],qo=-1;function Gs(e){return{current:e}}function Xn(e){0>qo||(e.current=_m[qo],_m[qo]=null,qo--)}function tn(e,t){qo++,_m[qo]=e.current,e.current=t}var Fs=Gs(null),jc=Gs(null),$a=Gs(null),kh=Gs(null);function Xh(e,t){switch(tn($a,t),tn(jc,e),tn(Fs,null),t.nodeType){case 9:case 11:e=(e=t.documentElement)&&(e=e.namespaceURI)?_1(e):0;break;default:if(e=t.tagName,t=t.namespaceURI)t=_1(t),e=gM(t,e);else switch(e){case"svg":e=1;break;case"math":e=2;break;default:e=0}}Xn(Fs),tn(Fs,e)}function fl(){Xn(Fs),Xn(jc),Xn($a)}function xm(e){var t=e.memoizedState;t!==null&&(Sl._currentValue=t.memoizedState,tn(kh,e)),t=Fs.current;var n=gM(t,e.type);t!==n&&(tn(jc,e),tn(Fs,n))}function Wh(e){jc.current===e&&(Xn(Fs),Xn(jc)),kh.current===e&&(Xn(kh),Sl._currentValue=Ir)}var Op,rx;function Ga(e){if(Op===void 0)try{throw Error()}catch(n){var t=n.stack.trim().match(/\n( *(at )?)/);Op=t&&t[1]||"",rx=-1<n.stack.indexOf(`
    at`)?" (<anonymous>)":-1<n.stack.indexOf("@")?"@unknown:0:0":""}return`
`+Op+e+rx}var Ip=!1;function Pp(e,t){if(!e||Ip)return"";Ip=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{var i={DetermineComponentFrameRoot:function(){try{if(t){var d=function(){throw Error()};if(Object.defineProperty(d.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(d,[])}catch(g){var h=g}Reflect.construct(e,[],d)}else{try{d.call()}catch(g){h=g}d=!1;try{var p=Object.getOwnPropertyDescriptor(e.prototype,"props");Object.defineProperty(e.prototype,"props",{configurable:!0,set:function(){throw Error()}}),d=!0,new e}finally{d&&(p!==void 0?Object.defineProperty(e.prototype,"props",p):delete e.prototype.props)}}}else{try{throw Error()}catch(g){h=g}(d=e())&&typeof d.catch=="function"&&d.catch(function(){})}}catch(g){if(g&&h&&typeof g.stack=="string")return[g.stack,h.stack]}return[null,null]}};i.DetermineComponentFrameRoot.displayName="DetermineComponentFrameRoot";var s=Object.getOwnPropertyDescriptor(i.DetermineComponentFrameRoot,"name");s&&s.configurable&&Object.defineProperty(i.DetermineComponentFrameRoot,"name",{value:"DetermineComponentFrameRoot"});var a=i.DetermineComponentFrameRoot(),r=a[0],o=a[1];if(r&&o){var l=r.split(`
`),c=o.split(`
`);for(s=i=0;i<l.length&&!l[i].includes("DetermineComponentFrameRoot");)i++;for(;s<c.length&&!c[s].includes("DetermineComponentFrameRoot");)s++;if(i===l.length||s===c.length)for(i=l.length-1,s=c.length-1;1<=i&&0<=s&&l[i]!==c[s];)s--;for(;1<=i&&0<=s;i--,s--)if(l[i]!==c[s]){if(i!==1||s!==1)do if(i--,s--,0>s||l[i]!==c[s]){var u=`
`+l[i].replace(" at new "," at ");return e.displayName&&u.includes("<anonymous>")&&(u=u.replace("<anonymous>",e.displayName)),u}while(1<=i&&0<=s);break}}}finally{Ip=!1,Error.prepareStackTrace=n}return(n=e?e.displayName||e.name:"")?Ga(n):""}function vw(e,t){switch(e.tag){case 26:case 27:case 5:return Ga(e.type);case 16:return Ga("Lazy");case 13:return e.child!==t&&t!==null?Ga("Suspense Fallback"):Ga("Suspense");case 19:return Ga("SuspenseList");case 0:case 15:return Pp(e.type,!1);case 11:return Pp(e.type.render,!1);case 1:return Pp(e.type,!0);case 31:return Ga("Activity");case 30:return Ga("ViewTransition");default:return""}}function ox(e){try{var t="",n=null;do t+=vw(e,n),n=e,e=e.return;while(e);return t}catch(i){return`
Error generating stack: `+i.message+`
`+i.stack}}var bm=Object.prototype.hasOwnProperty,E0=wn.unstable_scheduleCallback,zp=wn.unstable_cancelCallback,yw=wn.unstable_shouldYield,_w=wn.unstable_requestPaint,Oi=wn.unstable_now,xw=wn.unstable_getCurrentPriorityLevel,K1=wn.unstable_ImmediatePriority,j1=wn.unstable_UserBlockingPriority,qh=wn.unstable_NormalPriority,bw=wn.unstable_LowPriority,Q1=wn.unstable_IdlePriority,Sw=wn.log,Mw=wn.unstable_setDisableYieldValue,du=null,Ii=null;function Ya(e){if(typeof Sw=="function"&&Mw(e),Ii&&typeof Ii.setStrictMode=="function")try{Ii.setStrictMode(du,e)}catch{}}var Pi=Math.clz32?Math.clz32:Aw,Ew=Math.log,Tw=Math.LN2;function Aw(e){return e>>>=0,e===0?32:31-(Ew(e)/Tw|0)|0}var sh=256,ah=262144,rh=4194304;function Dr(e){var t=e&42;if(t!==0)return t;switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:return 64;case 128:return 128;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:return e&-e;case 262144:case 524288:case 1048576:case 2097152:return e&3932160;case 4194304:case 8388608:case 16777216:case 33554432:return e&62914560;case 67108864:return 67108864;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 0;default:return e}}function _f(e,t,n){var i=e.pendingLanes;if(i===0)return 0;var s=0,a=e.suspendedLanes,r=e.pingedLanes;e=e.warmLanes;var o=i&134217727;return o!==0?(i=o&~a,i!==0?s=Dr(i):(r&=o,r!==0?s=Dr(r):n||(n=o&~e,n!==0&&(s=Dr(n))))):(o=i&~a,o!==0?s=Dr(o):r!==0?s=Dr(r):n||(n=i&~e,n!==0&&(s=Dr(n)))),s===0?0:t!==0&&t!==s&&(t&a)===0&&(a=s&-s,n=t&-t,a>=n||a===32&&(n&4194048)!==0)?t:s}function pu(e,t){return(e.pendingLanes&~(e.suspendedLanes&~e.pingedLanes)&t)===0}function J1(e,t){(t&8)!==0&&(t|=t&32);var n=e.entangledLanes;if(n!==0)for(e=e.entanglements,n&=t;0<n;){var i=31-Pi(n),s=1<<i;t|=e[i],n&=~s}return t}function ww(e,t){switch(e){case 1:case 2:case 4:case 8:case 64:return t+250;case 16:case 32:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:return-1;case 67108864:case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function $1(){var e=rh;return rh<<=1,(rh&62914560)===0&&(rh=4194304),e}function Bp(e){for(var t=[],n=0;31>n;n++)t.push(e);return t}function mu(e,t){e.pendingLanes|=t,t!==268435456&&(e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0)}function Rw(e,t,n,i,s,a){var r=e.pendingLanes;e.pendingLanes=n,e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0,e.expiredLanes&=n,e.entangledLanes&=n,e.errorRecoveryDisabledLanes&=n,e.shellSuspendCounter=0;var o=e.entanglements,l=e.expirationTimes,c=e.hiddenUpdates;for(n=r&~n;0<n;){var u=31-Pi(n),d=1<<u;o[u]=0,l[u]=-1;var h=c[u];if(h!==null)for(c[u]=null,u=0;u<h.length;u++){var p=h[u];p!==null&&(p.lane&=-536870913)}n&=~d}i!==0&&tb(e,i,0),a!==0&&s===0&&e.tag!==0&&(e.suspendedLanes|=a&~(r&~t))}function tb(e,t,n){e.pendingLanes|=t,e.suspendedLanes&=~t;var i=31-Pi(t);e.entangledLanes|=t,e.entanglements[i]=e.entanglements[i]|1073741824|n&261930}function eb(e,t){var n=e.entangledLanes|=t;for(e=e.entanglements;n;){var i=31-Pi(n),s=1<<i;s&t|e[i]&t&&(e[i]|=t),n&=~s}}function nb(e,t){var n=t&-t;return n=(n&42)!==0?1:T0(n),(n&(e.suspendedLanes|t))!==0?0:n}function T0(e){switch(e){case 2:e=1;break;case 8:e=4;break;case 32:e=16;break;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:e=128;break;case 268435456:e=134217728;break;default:e=0}return e}function A0(e){return e&=-e,2<e?8<e?(e&134217727)!==0?32:268435456:8:2}function ib(){var e=Le.p;return e!==0?e:(e=window.event,e===void 0?32:BM(e.type))}function lx(e,t){var n=Le.p;try{return Le.p=e,t()}finally{Le.p=n}}var ga=Math.random().toString(36).slice(2),Gn="__reactFiber$"+ga,Ei="__reactProps$"+ga,Tl="__reactContainer$"+ga,cx="__reactEvents$"+ga,Cw="__reactListeners$"+ga,Dw="__reactHandles$"+ga,ux="__reactResources$"+ga,gu="__reactMarker$"+ga,Yh="__reactLoad$"+ga;function xf(e){delete e[Gn],delete e[Ei],delete e[Cw],delete e[Dw]}function Lr(e){var t;if(t=e[Gn])return t;for(var n=e.parentNode;n;){if(t=n[Tl]||n[Gn]){if(n=t.alternate,t.child!==null||n!==null&&n.child!==null)for(e=w1(e);e!==null;){if(n=e[Gn])return n;e=w1(e)}return t}e=n,n=e.parentNode}return null}function Al(e){if(e=e[Gn]||e[Tl]){var t=e.tag;if(t===5||t===6||t===13||t===31||t===26||t===27||t===3)return e}return null}function Oc(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e.stateNode;throw Error(at(33))}function nl(e){var t=e[ux];return t||(t=e[ux]={hoistableStyles:new Map,hoistableScripts:new Map}),t}function zn(e){e[gu]=!0}function sb(e){e[Yh]=void 0}var ab=new Set,rb={};function Kr(e,t){dl(e,t),dl(e+"Capture",t)}function dl(e,t){for(rb[e]=t,e=0;e<t.length;e++)ab.add(t[e])}var Nw=RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"),hx={},fx={};function Uw(e){return bm.call(fx,e)?!0:bm.call(hx,e)?!1:Nw.test(e)?fx[e]=!0:(hx[e]=!0,!1)}var Ne=!1;function dx(){var e=Ne;return Ne=!1,e}function Eh(e,t,n){if(Uw(t))if(n===null)e.removeAttribute(t);else{switch(typeof n){case"undefined":case"function":case"symbol":e.removeAttribute(t);return;case"boolean":var i=t.toLowerCase().slice(0,5);if(i!=="data-"&&i!=="aria-"){e.removeAttribute(t);return}}e.setAttribute(t,n)}}function oh(e,t,n){if(n===null)e.removeAttribute(t);else{switch(typeof n){case"undefined":case"function":case"symbol":case"boolean":e.removeAttribute(t);return}e.setAttribute(t,n)}}function sa(e,t,n,i){if(i===null)e.removeAttribute(n);else{switch(typeof i){case"undefined":case"function":case"symbol":case"boolean":e.removeAttribute(n);return}e.setAttributeNS(t,n,i)}}function Di(e){switch(typeof e){case"bigint":case"boolean":case"number":case"string":case"undefined":return e;case"object":return e;default:return""}}function ob(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()==="input"&&(t==="checkbox"||t==="radio")}function Lw(e,t,n){var i=Object.getOwnPropertyDescriptor(e.constructor.prototype,t);if(!e.hasOwnProperty(t)&&typeof i<"u"&&typeof i.get=="function"&&typeof i.set=="function"){var s=i.get,a=i.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return s.call(this)},set:function(r){n=""+r,a.call(this,r)}}),Object.defineProperty(e,t,{enumerable:i.enumerable}),{getValue:function(){return n},setValue:function(r){n=""+r},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function Sm(e){if(!e._valueTracker){var t=ob(e)?"checked":"value";e._valueTracker=Lw(e,t,""+e[t])}}function lb(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var n=t.getValue(),i="";return e&&(i=ob(e)?e.checked?"true":"false":e.value),e=i,e!==n?(t.setValue(e),!0):!1}var Ow=/[\n"\\]/g;function Qi(e){return e.replace(Ow,function(t){return"\\"+t.charCodeAt(0).toString(16)+" "})}function Mm(e,t,n,i,s,a,r,o){e.name="",r!=null&&typeof r!="function"&&typeof r!="symbol"&&typeof r!="boolean"?e.type=r:e.removeAttribute("type"),t!=null?r==="number"?(t===0&&e.value===""||e.value!=t)&&(e.value=""+Di(t)):e.value!==""+Di(t)&&(e.value=""+Di(t)):r!=="submit"&&r!=="reset"||e.removeAttribute("value"),t!=null?r==="number"&&e.value==t?Fp(e,Di(e.value)):Fp(e,Di(t)):n!=null?Fp(e,Di(n)):i!=null&&e.removeAttribute("value"),s==null&&a!=null&&(e.defaultChecked=!!a),s!=null&&(e.checked=s&&typeof s!="function"&&typeof s!="symbol"),o!=null&&typeof o!="function"&&typeof o!="symbol"&&typeof o!="boolean"?e.name=""+Di(o):e.removeAttribute("name")}function cb(e,t,n,i,s,a,r,o){if(a!=null&&typeof a!="function"&&typeof a!="symbol"&&typeof a!="boolean"&&(e.type=a),t!=null||n!=null){if(!(a!=="submit"&&a!=="reset"||t!=null)){Sm(e);return}n=n!=null?""+Di(n):"",t=t!=null?""+Di(t):n,o||t===e.value||(e.value=t),e.defaultValue=t}i=i??s,i=typeof i!="function"&&typeof i!="symbol"&&!!i,e.checked=o?e.checked:!!i,e.defaultChecked=!!i,r!=null&&typeof r!="function"&&typeof r!="symbol"&&typeof r!="boolean"&&(e.name=r),Sm(e)}function Fp(e,t){e.defaultValue!==""+t&&(e.defaultValue=""+t)}function il(e,t,n,i){if(e=e.options,t){t={};for(var s=0;s<n.length;s++)t["$"+n[s]]=!0;for(n=0;n<e.length;n++)s=t.hasOwnProperty("$"+e[n].value),e[n].selected!==s&&(e[n].selected=s),s&&i&&(e[n].defaultSelected=!0)}else{for(n=""+Di(n),t=null,s=0;s<e.length;s++){if(e[s].value===n){e[s].selected=!0,i&&(e[s].defaultSelected=!0);return}t!==null||e[s].disabled||(t=e[s])}t!==null&&(t.selected=!0)}}function ub(e,t,n){if(t!=null&&(t=""+Di(t),t!==e.value&&(e.value=t),n==null)){e.defaultValue!==t&&(e.defaultValue=t);return}e.defaultValue=n!=null?""+Di(n):""}function hb(e,t,n,i){if(t==null){if(i!=null){if(n!=null)throw Error(at(92));if(Lc(i)){if(1<i.length)throw Error(at(93));i=i[0]}n=i}n==null&&(n=""),t=n}n=Di(t),e.defaultValue=n,i=e.textContent,i===n&&i!==""&&i!==null&&(e.value=i),Sm(e)}function pl(e,t){if(t){var n=e.firstChild;if(n&&n===e.lastChild&&n.nodeType===3){n.nodeValue=t;return}}e.textContent=t}var Iw=new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));function px(e,t,n){var i=t.indexOf("--")===0;n==null||typeof n=="boolean"||n===""?i?e.setProperty(t,""):t==="float"?e.cssFloat="":e[t]="":i?e.setProperty(t,n):typeof n!="number"||n===0||Iw.has(t)?t==="float"?e.cssFloat=n:e[t]=(""+n).trim():e[t]=n+"px"}function fb(e,t,n){if(t!=null&&typeof t!="object")throw Error(at(62));if(e=e.style,n!=null){for(var i in n)!n.hasOwnProperty(i)||t!=null&&t.hasOwnProperty(i)||(i.indexOf("--")===0?e.setProperty(i,""):i==="float"?e.cssFloat="":e[i]="",Ne=!0);for(var s in t)i=t[s],t.hasOwnProperty(s)&&n[s]!==i&&(px(e,s,i),Ne=!0)}else for(var a in t)t.hasOwnProperty(a)&&px(e,a,t[a])}function w0(e){if(e.indexOf("-")===-1)return!1;switch(e){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var Pw=new Map([["acceptCharset","accept-charset"],["htmlFor","for"],["httpEquiv","http-equiv"],["crossOrigin","crossorigin"],["accentHeight","accent-height"],["alignmentBaseline","alignment-baseline"],["arabicForm","arabic-form"],["baselineShift","baseline-shift"],["capHeight","cap-height"],["clipPath","clip-path"],["clipRule","clip-rule"],["colorInterpolation","color-interpolation"],["colorInterpolationFilters","color-interpolation-filters"],["colorProfile","color-profile"],["colorRendering","color-rendering"],["dominantBaseline","dominant-baseline"],["enableBackground","enable-background"],["fillOpacity","fill-opacity"],["fillRule","fill-rule"],["floodColor","flood-color"],["floodOpacity","flood-opacity"],["fontFamily","font-family"],["fontSize","font-size"],["fontSizeAdjust","font-size-adjust"],["fontStretch","font-stretch"],["fontStyle","font-style"],["fontVariant","font-variant"],["fontWeight","font-weight"],["glyphName","glyph-name"],["glyphOrientationHorizontal","glyph-orientation-horizontal"],["glyphOrientationVertical","glyph-orientation-vertical"],["horizAdvX","horiz-adv-x"],["horizOriginX","horiz-origin-x"],["imageRendering","image-rendering"],["letterSpacing","letter-spacing"],["lightingColor","lighting-color"],["markerEnd","marker-end"],["markerMid","marker-mid"],["markerStart","marker-start"],["maskType","mask-type"],["overlinePosition","overline-position"],["overlineThickness","overline-thickness"],["paintOrder","paint-order"],["panose-1","panose-1"],["pointerEvents","pointer-events"],["renderingIntent","rendering-intent"],["shapeRendering","shape-rendering"],["stopColor","stop-color"],["stopOpacity","stop-opacity"],["strikethroughPosition","strikethrough-position"],["strikethroughThickness","strikethrough-thickness"],["strokeDasharray","stroke-dasharray"],["strokeDashoffset","stroke-dashoffset"],["strokeLinecap","stroke-linecap"],["strokeLinejoin","stroke-linejoin"],["strokeMiterlimit","stroke-miterlimit"],["strokeOpacity","stroke-opacity"],["strokeWidth","stroke-width"],["textAnchor","text-anchor"],["textDecoration","text-decoration"],["textRendering","text-rendering"],["transformOrigin","transform-origin"],["underlinePosition","underline-position"],["underlineThickness","underline-thickness"],["unicodeBidi","unicode-bidi"],["unicodeRange","unicode-range"],["unitsPerEm","units-per-em"],["vAlphabetic","v-alphabetic"],["vHanging","v-hanging"],["vIdeographic","v-ideographic"],["vMathematical","v-mathematical"],["vectorEffect","vector-effect"],["vertAdvY","vert-adv-y"],["vertOriginX","vert-origin-x"],["vertOriginY","vert-origin-y"],["wordSpacing","word-spacing"],["writingMode","writing-mode"],["xmlnsXlink","xmlns:xlink"],["xHeight","x-height"]]),zw=/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;function Th(e){return zw.test(""+e)?"javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')":e}function Ps(){}var Em=null;function R0(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var Yo=null,sl=null;function mx(e){var t=Al(e);if(t&&(e=t.stateNode)){var n=e[Ei]||null;t:switch(e=t.stateNode,t.type){case"input":if(Mm(e,n.value,n.defaultValue,n.defaultValue,n.checked,n.defaultChecked,n.type,n.name),t=n.name,n.type==="radio"&&t!=null){for(n=e;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll('input[name="'+Qi(""+t)+'"][type="radio"]'),t=0;t<n.length;t++){var i=n[t];if(i!==e&&i.form===e.form){var s=i[Ei]||null;if(!s)throw Error(at(90));Mm(i,s.value,s.defaultValue,s.defaultValue,s.checked,s.defaultChecked,s.type,s.name)}}for(t=0;t<n.length;t++)i=n[t],i.form===e.form&&lb(i)}break t;case"textarea":ub(e,n.value,n.defaultValue);break t;case"select":t=n.value,t!=null&&il(e,!!n.multiple,t,!1)}}}var Hp=!1;function db(e,t,n){if(Hp)return e(t,n);Hp=!0;try{var i=e(t);return i}finally{if(Hp=!1,(Yo!==null||sl!==null)&&(Of(),Yo&&(t=Yo,e=sl,sl=Yo=null,mx(t),e)))for(t=0;t<e.length;t++)mx(e[t])}}function Qc(e,t){var n=e.stateNode;if(n===null)return null;var i=n[Ei]||null;if(i===null)return null;n=i[t];t:switch(t){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(i=!i.disabled)||(e=e.type,i=!(e==="button"||e==="input"||e==="select"||e==="textarea")),e=!i;break t;default:e=!1}if(e)return null;if(n&&typeof n!="function")throw Error(at(231,t,typeof n));return n}var ua=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),Tm=!1;if(ua)try{Bo={},Object.defineProperty(Bo,"passive",{get:function(){Tm=!0}}),window.addEventListener("test",Bo,Bo),window.removeEventListener("test",Bo,Bo)}catch{Tm=!1}var Bo,Za=null,C0=null,Ah=null;function pb(){if(Ah)return Ah;var e,t=C0,n=t.length,i,s="value"in Za?Za.value:Za.textContent,a=s.length;for(e=0;e<n&&t[e]===s[e];e++);var r=n-e;for(i=1;i<=r&&t[n-i]===s[a-i];i++);return Ah=s.slice(e,1<i?1-i:void 0)}function wh(e){var t=e.keyCode;return"charCode"in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function lh(){return!0}function gx(){return!1}function fi(e){function t(n,i,s,a,r){this._reactName=n,this._targetInst=s,this.type=i,this.nativeEvent=a,this.target=r,this.currentTarget=null;for(var o in e)e.hasOwnProperty(o)&&(n=e[o],this[o]=n?n(a):a[o]);return this.isDefaultPrevented=(a.defaultPrevented!=null?a.defaultPrevented:a.returnValue===!1)?lh:gx,this.isPropagationStopped=gx,this}return je(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var n=this.nativeEvent;n&&(n.preventDefault?n.preventDefault():typeof n.returnValue!="unknown"&&(n.returnValue=!1),this.isDefaultPrevented=lh)},stopPropagation:function(){var n=this.nativeEvent;n&&(n.stopPropagation?n.stopPropagation():typeof n.cancelBubble!="unknown"&&(n.cancelBubble=!0),this.isPropagationStopped=lh)},persist:function(){},isPersistent:lh}),t}var pr={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},bf=fi(pr),vu=je({},pr,{view:0,detail:0}),Bw=fi(vu),Vp,Gp,wc,Sf=je({},vu,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:D0,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return"movementX"in e?e.movementX:(e!==wc&&(wc&&e.type==="mousemove"?(Vp=e.screenX-wc.screenX,Gp=e.screenY-wc.screenY):Gp=Vp=0,wc=e),Vp)},movementY:function(e){return"movementY"in e?e.movementY:Gp}}),vx=fi(Sf),Fw=je({},Sf,{dataTransfer:0}),Hw=fi(Fw),Vw=je({},vu,{relatedTarget:0}),kp=fi(Vw),Gw=je({},pr,{animationName:0,elapsedTime:0,pseudoElement:0}),kw=fi(Gw),Xw=je({},pr,{clipboardData:function(e){return"clipboardData"in e?e.clipboardData:window.clipboardData}}),Ww=fi(Xw),qw=je({},pr,{data:0}),yx=fi(qw),Yw={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},Zw={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},Kw={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function jw(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=Kw[e])?!!t[e]:!1}function D0(){return jw}var Qw=je({},vu,{key:function(e){if(e.key){var t=Yw[e.key]||e.key;if(t!=="Unidentified")return t}return e.type==="keypress"?(e=wh(e),e===13?"Enter":String.fromCharCode(e)):e.type==="keydown"||e.type==="keyup"?Zw[e.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:D0,charCode:function(e){return e.type==="keypress"?wh(e):0},keyCode:function(e){return e.type==="keydown"||e.type==="keyup"?e.keyCode:0},which:function(e){return e.type==="keypress"?wh(e):e.type==="keydown"||e.type==="keyup"?e.keyCode:0}}),Jw=fi(Qw),$w=je({},Sf,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),_x=fi($w),t2=je({},pr,{submitter:0}),e2=fi(t2),n2=je({},vu,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:D0}),i2=fi(n2),s2=je({},pr,{propertyName:0,elapsedTime:0,pseudoElement:0}),a2=fi(s2),r2=je({},Sf,{deltaX:function(e){return"deltaX"in e?e.deltaX:"wheelDeltaX"in e?-e.wheelDeltaX:0},deltaY:function(e){return"deltaY"in e?e.deltaY:"wheelDeltaY"in e?-e.wheelDeltaY:"wheelDelta"in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0}),o2=fi(r2),l2=je({},pr,{newState:0,oldState:0,source:0}),c2=fi(l2),u2=[9,13,27,32],N0=ua&&"CompositionEvent"in window,zc=null;ua&&"documentMode"in document&&(zc=document.documentMode);var h2=ua&&"TextEvent"in window&&!zc,mb=ua&&(!N0||zc&&8<zc&&11>=zc),xx=" ",bx=!1;function gb(e,t){switch(e){case"keyup":return u2.indexOf(t.keyCode)!==-1;case"keydown":return t.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function vb(e){return e=e.detail,typeof e=="object"&&"data"in e?e.data:null}var Zo=!1;function f2(e,t){switch(e){case"compositionend":return vb(t);case"keypress":return t.which!==32?null:(bx=!0,xx);case"textInput":return e=t.data,e===xx&&bx?null:e;default:return null}}function d2(e,t){if(Zo)return e==="compositionend"||!N0&&gb(e,t)?(e=pb(),Ah=C0=Za=null,Zo=!1,e):null;switch(e){case"paste":return null;case"keypress":if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case"compositionend":return mb&&t.locale!=="ko"?null:t.data;default:return null}}var p2={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function Sx(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t==="input"?!!p2[e.type]:t==="textarea"}function yb(e,t,n,i){Yo?sl?sl.push(i):sl=[i]:Yo=i,t=gf(t,"onChange"),0<t.length&&(n=new bf("onChange","change",null,n,i),e.push({event:n,listeners:t}))}var Bc=null,Jc=null;function m2(e){dM(e,0)}function Mf(e){var t=Oc(e);if(lb(t))return e}function Mx(e,t){if(e==="change")return t}var _b=!1;ua&&(ua?(uh="oninput"in document,uh||(Xp=document.createElement("div"),Xp.setAttribute("oninput","return;"),uh=typeof Xp.oninput=="function"),ch=uh):ch=!1,_b=ch&&(!document.documentMode||9<document.documentMode));var ch,uh,Xp;function Ex(){Bc&&(Bc.detachEvent("onpropertychange",xb),Jc=Bc=null)}function xb(e){if(e.propertyName==="value"&&Mf(Jc)){var t=[];yb(t,Jc,e,R0(e)),db(m2,t)}}function g2(e,t,n){e==="focusin"?(Ex(),Bc=t,Jc=n,Bc.attachEvent("onpropertychange",xb)):e==="focusout"&&Ex()}function v2(e){if(e==="selectionchange"||e==="keyup"||e==="keydown")return Mf(Jc)}function y2(e,t){if(e==="click")return Mf(t)}function _2(e,t){if(e==="input"||e==="change")return Mf(t)}function x2(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var Bi=typeof Object.is=="function"?Object.is:x2;function $c(e,t){if(Bi(e,t))return!0;if(typeof e!="object"||e===null||typeof t!="object"||t===null)return!1;var n=Object.keys(e),i=Object.keys(t);if(n.length!==i.length)return!1;for(i=0;i<n.length;i++){var s=n[i];if(!bm.call(t,s)||!Bi(e[s],t[s]))return!1}return!0}function Am(e){if(e=e||(typeof document<"u"?document:void 0),typeof e>"u")return null;try{return e.activeElement||e.body}catch{return e.body}}function Tx(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function Ax(e,t){var n=Tx(e);e=0;for(var i;n;){if(n.nodeType===3){if(i=e+n.textContent.length,e<=t&&i>=t)return{node:n,offset:t-e};e=i}t:{for(;n;){if(n.nextSibling){n=n.nextSibling;break t}n=n.parentNode}n=void 0}n=Tx(n)}}function bb(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?bb(e,t.parentNode):"contains"in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function Sb(e){e=e!=null&&e.ownerDocument!=null&&e.ownerDocument.defaultView!=null?e.ownerDocument.defaultView:window;for(var t=Am(e.document);t instanceof e.HTMLIFrameElement;){try{var n=typeof t.contentWindow.location.href=="string"}catch{n=!1}if(n)e=t.contentWindow;else break;t=Am(e.document)}return t}function U0(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t==="input"&&(e.type==="text"||e.type==="search"||e.type==="tel"||e.type==="url"||e.type==="password")||t==="textarea"||e.contentEditable==="true")}var b2=ua&&"documentMode"in document&&11>=document.documentMode,Ko=null,wm=null,Fc=null,Rm=!1;function wx(e,t,n){var i=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;Rm||Ko==null||Ko!==Am(i)||(i=Ko,"selectionStart"in i&&U0(i)?i={start:i.selectionStart,end:i.selectionEnd}:(i=(i.ownerDocument&&i.ownerDocument.defaultView||window).getSelection(),i={anchorNode:i.anchorNode,anchorOffset:i.anchorOffset,focusNode:i.focusNode,focusOffset:i.focusOffset}),Fc&&$c(Fc,i)||(Fc=i,i=gf(wm,"onSelect"),0<i.length&&(t=new bf("onSelect","select",null,t,n),e.push({event:t,listeners:i}),t.target=Ko)))}function Rr(e,t){var n={};return n[e.toLowerCase()]=t.toLowerCase(),n["Webkit"+e]="webkit"+t,n["Moz"+e]="moz"+t,n}var jo={animationend:Rr("Animation","AnimationEnd"),animationiteration:Rr("Animation","AnimationIteration"),animationstart:Rr("Animation","AnimationStart"),transitionrun:Rr("Transition","TransitionRun"),transitionstart:Rr("Transition","TransitionStart"),transitioncancel:Rr("Transition","TransitionCancel"),transitionend:Rr("Transition","TransitionEnd")},Wp={},Mb={};ua&&(Mb=document.createElement("div").style,"AnimationEvent"in window||(delete jo.animationend.animation,delete jo.animationiteration.animation,delete jo.animationstart.animation),"TransitionEvent"in window||delete jo.transitionend.transition);function jr(e){if(Wp[e])return Wp[e];if(!jo[e])return e;var t=jo[e],n;for(n in t)if(t.hasOwnProperty(n)&&n in Mb)return Wp[e]=t[n];return e}var Eb=jr("animationend"),Tb=jr("animationiteration"),Ab=jr("animationstart"),S2=jr("transitionrun"),M2=jr("transitionstart"),E2=jr("transitioncancel"),wb=jr("transitionend"),Rb=new Map,Cm="abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error fullscreenChange fullscreenError gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");Cm.push("scrollEnd");function ps(e,t){Rb.set(e,t),Kr(t,[e])}var T2=0;function ha(e,t){if(e.name!=null&&e.name!=="auto")return e.name;if(t.autoName!==null)return t.autoName;e=ds.identifierPrefix;var n=T2++;return e="_"+e+"t_"+n.toString(32)+"_",t.autoName=e}function Rx(e){if(e==null||typeof e=="string")return e;var t=null,n=hl;if(n!==null)for(var i=0;i<n.length;i++){var s=e[n[i]];if(s!=null){if(s==="none")return"none";t=t==null?s:t+(" "+s)}}return t??e.default}function va(e,t){return e=Rx(e),t=Rx(t),t==null?e==="auto"?null:e:t==="auto"?null:t}var Zh=typeof reportError=="function"?reportError:function(e){if(typeof window=="object"&&typeof window.ErrorEvent=="function"){var t=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:typeof e=="object"&&e!==null&&typeof e.message=="string"?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process=="object"&&typeof process.emit=="function"){process.emit("uncaughtException",e);return}console.error(e)},Zi=[],Qo=0,L0=0;function Ef(){for(var e=Qo,t=L0=Qo=0;t<e;){var n=Zi[t];Zi[t++]=null;var i=Zi[t];Zi[t++]=null;var s=Zi[t];Zi[t++]=null;var a=Zi[t];if(Zi[t++]=null,i!==null&&s!==null){var r=i.pending;r===null?s.next=s:(s.next=r.next,r.next=s),i.pending=s}a!==0&&Cb(n,s,a)}}function Tf(e,t,n,i){Zi[Qo++]=e,Zi[Qo++]=t,Zi[Qo++]=n,Zi[Qo++]=i,L0|=i,e.lanes|=i,e=e.alternate,e!==null&&(e.lanes|=i)}function O0(e,t,n,i){return Tf(e,t,n,i),Kh(e)}function Qr(e,t){return Tf(e,null,null,t),Kh(e)}function Cb(e,t,n){e.lanes|=n;var i=e.alternate;i!==null&&(i.lanes|=n);for(var s=!1,a=e.return;a!==null;)a.childLanes|=n,i=a.alternate,i!==null&&(i.childLanes|=n),a.tag===22&&(e=a.stateNode,e===null||e._visibility&1||(s=!0)),e=a,a=a.return;return e.tag===3?(a=e.stateNode,s&&t!==null&&(s=31-Pi(n),e=a.hiddenUpdates,i=e[s],i===null?e[s]=[t]:i.push(t),t.lane=n|536870912),a):null}function Kh(e){if(50<Kc)throw Kc=0,zh=null,Error(at(185));for(var t=e.return;t!==null;)e=t,t=e.return;return e.tag===3?e.stateNode:null}var Jo={};function A2(e,t,n,i){this.tag=e,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.refCleanup=this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=i,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function bi(e,t,n,i){return new A2(e,t,n,i)}function I0(e){return e=e.prototype,!(!e||!e.isReactComponent)}function la(e,t){var n=e.alternate;return n===null?(n=bi(e.tag,t,e.key,e.mode),n.elementType=e.elementType,n.type=e.type,n.stateNode=e.stateNode,n.alternate=e,e.alternate=n):(n.pendingProps=t,n.type=e.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=e.flags&1206910976,n.childLanes=e.childLanes,n.lanes=e.lanes,n.child=e.child,n.memoizedProps=e.memoizedProps,n.memoizedState=e.memoizedState,n.updateQueue=e.updateQueue,t=e.dependencies,n.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},n.sibling=e.sibling,n.index=e.index,n.ref=e.ref,n.refCleanup=e.refCleanup,n}function Db(e,t){e.flags&=1206910978;var n=e.alternate;return n===null?(e.childLanes=0,e.lanes=t,e.child=null,e.subtreeFlags=0,e.memoizedProps=null,e.memoizedState=null,e.updateQueue=null,e.dependencies=null,e.stateNode=null):(e.childLanes=n.childLanes,e.lanes=n.lanes,e.child=n.child,e.subtreeFlags=0,e.deletions=null,e.memoizedProps=n.memoizedProps,e.memoizedState=n.memoizedState,e.updateQueue=n.updateQueue,e.type=n.type,t=n.dependencies,e.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext}),e}function Rh(e,t,n,i,s,a){var r=0;if(i=e,typeof i=="function")I0(i)&&(r=1);else if(typeof i=="string")r=JR(e,n,Fs.current)?26:e==="html"||e==="head"||e==="body"?27:5;else t:switch(i){case gm:return e=bi(31,n,t,s),e.elementType=gm,e.lanes=a,e;case Wo:return Pr(n.children,s,a,t);case Y1:r=8,s|=24;break;case dm:return e=bi(12,n,t,s|2),e.elementType=dm,e.lanes=a,e;case pm:return e=bi(13,n,t,s),e.elementType=pm,e.lanes=a,e;case mm:return e=bi(19,n,t,s),e.elementType=mm,e.lanes=a,e;case dw:case vm:return e=s|32,e=bi(30,n,t,e),e.elementType=vm,e.lanes=a,e.stateNode={autoName:null,paired:null,clones:null,ref:null},e;default:if(typeof i=="object"&&i!==null)switch(i.$$typeof){case Is:r=10;break t;case Z1:r=9;break t;case S0:r=11;break t;case M0:r=14;break t;case Xa:r=16,i=null;break t}r=29,n=Error(at(130,e===null?"null":typeof e,"")),i=null}return t=bi(r,n,t,s),t.elementType=e,t.type=i,t.lanes=a,t}function Pr(e,t,n,i){return e=bi(7,e,i,t),e.lanes=n,e}function qp(e,t,n){return e=bi(6,e,null,t),e.lanes=n,e}function Nb(e){var t=bi(18,null,null,0);return t.stateNode=e,t}function Yp(e,t,n){return t=bi(4,e.children!==null?e.children:[],e.key,t),t.lanes=n,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}var Cx=new WeakMap;function Ji(e,t){if(typeof e=="object"&&e!==null){var n=Cx.get(e);return n!==void 0?n:(t={value:e,source:t,stack:ox(t)},Cx.set(e,t),t)}return{value:e,source:t,stack:ox(t)}}var $o=[],tl=0,jh=null,tu=0,Ki=[],ji=0,cr=null,zs=1,Bs="";function ra(e,t){$o[tl++]=tu,$o[tl++]=jh,jh=e,tu=t}function Ub(e,t,n){Ki[ji++]=zs,Ki[ji++]=Bs,Ki[ji++]=cr,cr=e;var i=zs;e=Bs;var s=32-Pi(i)-1;i&=~(1<<s),n+=1;var a=32-Pi(t)+s;if(30<a){var r=s-s%5;a=(i&(1<<r)-1).toString(32),i>>=r,s-=r,zs=1<<32-Pi(t)+s|n<<s|i,Bs=a+e}else zs=1<<a|n<<s|i,Bs=e}function Af(e){e.return!==null&&(ra(e,1),Ub(e,1,0))}function P0(e){for(;e===jh;)jh=$o[--tl],$o[tl]=null,tu=$o[--tl],$o[tl]=null;for(;e===cr;)cr=Ki[--ji],Ki[ji]=null,Bs=Ki[--ji],Ki[ji]=null,zs=Ki[--ji],Ki[ji]=null}function Lb(e,t){Ki[ji++]=zs,Ki[ji++]=Bs,Ki[ji++]=cr,zs=t.id,Bs=t.overflow,cr=e}var Bn=null,$e=null,Me=!1,tr=null,$i=!1,Dm=Error(at(519));function ur(e){var t=Error(at(418,1<arguments.length&&arguments[1]!==void 0&&arguments[1]?"text":"HTML",""));throw eu(Ji(t,e)),Dm}function Dx(e){var t=e.stateNode,n=e.type,i=e.memoizedProps;switch(t[Gn]=e,t[Ei]=i,n){case"dialog":we("cancel",t),we("close",t);break;case"iframe":case"object":case"embed":we("load",t);break;case"video":case"audio":for(n=0;n<au.length;n++)we(au[n],t);break;case"source":we("error",t);break;case"img":case"image":case"link":we("error",t),we("load",t);break;case"details":we("toggle",t);break;case"input":we("invalid",t),cb(t,i.value,i.defaultValue,i.checked,i.defaultChecked,i.type,i.name,!0);break;case"select":we("invalid",t);break;case"textarea":we("invalid",t),hb(t,i.value,i.defaultValue,i.children)}n=i.children,typeof n!="string"&&typeof n!="number"&&typeof n!="bigint"||t.textContent===""+n||i.suppressHydrationWarning===!0||mM(t.textContent,n)?(i.popover!=null&&(we("beforetoggle",t),we("toggle",t)),i.onScroll!=null&&we("scroll",t),i.onScrollEnd!=null&&we("scrollend",t),i.onClick!=null&&(t.onclick=Ps),t=!0):t=!1,t||ur(e,!0)}function Qh(e){for(Bn=e.return;Bn;)switch(Bn.tag){case 5:case 31:case 13:$i=!1;return;case 27:case 3:$i=!0;return;default:Bn=Bn.return}}function Fo(e){if(e!==Bn)return!1;if(!Me)return Qh(e),Me=!0,!1;var t=e.tag,n;if((n=t!==3&&t!==27)&&((n=t===5)&&(n=e.type,n=!(n!=="form"&&n!=="button")||p0(e.type,e.memoizedProps)),n=!n),n&&$e&&ur(e),Qh(e),t===13){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(at(317));$e=A1(e)}else if(t===31){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(at(317));$e=A1(e)}else t===27?(t=$e,mr(e.type)?(e=y0,y0=null,$e=e):$e=t):$e=Bn?ts(e.stateNode.nextSibling):null;return!0}function Hr(){$e=Bn=null,Me=!1}function Zp(){var e=tr;return e!==null&&(_i===null?_i=e:_i.push.apply(_i,e),tr=null),e}function eu(e){tr===null?tr=[e]:tr.push(e)}var Nm=Gs(null),Jr=null,oa=null;function Ka(e,t,n){tn(Nm,t._currentValue),t._currentValue=n}function ca(e){e._currentValue=Nm.current,Xn(Nm)}function Ch(e,t,n){for(;e!==null;){var i=e.alternate;if((e.childLanes&t)!==t?(e.childLanes|=t,i!==null&&(i.childLanes|=t)):i!==null&&(i.childLanes&t)!==t&&(i.childLanes|=t),e===n)break;e=e.return}}function Um(e,t,n,i){var s=e.child;for(s!==null&&(s.return=e);s!==null;){var a=s.dependencies;if(a!==null){var r=s.child;a=a.firstContext;t:for(;a!==null;){var o=a;a=s;for(var l=0;l<t.length;l++)if(o.context===t[l]){a.lanes|=n,o=a.alternate,o!==null&&(o.lanes|=n),Ch(a.return,n,e),i||(r=null);break t}a=o.next}}else if(s.tag===18){if(r=s.return,r===null)throw Error(at(341));r.lanes|=n,a=r.alternate,a!==null&&(a.lanes|=n),Ch(r,n,e),r=null}else s.tag===13&&s.memoizedState!==null&&s.memoizedState.dehydrated===null?(s.lanes|=n,r=s.alternate,r!==null&&(r.lanes|=n),Ch(s.return,n,e),r=s.child,r=r!==null?r.sibling:null):r=s.child;if(r!==null)r.return=s;else for(r=s;r!==null;){if(r===e){r=null;break}if(s=r.sibling,s!==null){s.return=r.return,r=s;break}r=r.return}s=r}}function Vr(e,t,n,i){e=null;for(var s=t,a=!1;s!==null;){if(!a){if((s.flags&524288)!==0)a=!0;else if((s.flags&262144)!==0)break}if(s.tag===10){var r=s.alternate;if(r===null)throw Error(at(387));if(r=r.memoizedProps,r!==null){var o=s.type;Bi(s.pendingProps.value,r.value)||(e!==null?e.push(o):e=[o])}}else if(s===kh.current){if(r=s.alternate,r===null)throw Error(at(387));r.memoizedState.memoizedState!==s.memoizedState.memoizedState&&(e!==null?e.push(Sl):e=[Sl])}s=s.return}return e!==null&&Um(t,e,n,i),t.flags|=262144,e!==null}function Jh(e){for(e=e.firstContext;e!==null;){if(!Bi(e.context._currentValue,e.memoizedValue))return!0;e=e.next}return!1}function Gr(e){Jr=e,oa=null,e=e.dependencies,e!==null&&(e.firstContext=null)}function kn(e){return Ob(Jr,e)}function hh(e,t){return Jr===null&&Gr(e),Ob(e,t)}function Ob(e,t){var n=t._currentValue;if(t={context:t,memoizedValue:n,next:null},oa===null){if(e===null)throw Error(at(308));oa=t,e.dependencies={lanes:0,firstContext:t},e.flags|=524288}else oa=oa.next=t;return n}var w2=typeof AbortController<"u"?AbortController:function(){var e=[],t=this.signal={aborted:!1,addEventListener:function(n,i){e.push(i)}};this.abort=function(){t.aborted=!0,e.forEach(function(n){return n()})}},R2=wn.unstable_scheduleCallback,C2=wn.unstable_NormalPriority,bn={$$typeof:Is,Consumer:null,Provider:null,_currentValue:null,_currentValue2:null,_threadCount:0};function z0(){return{controller:new w2,data:new Map,refCount:0}}function yu(e){e.refCount--,e.refCount===0&&R2(C2,function(){e.controller.abort()})}function Nx(e,t){if((e.pendingLanes&4194048)!==0){var n=e.transitionTypes;for(n===null&&(n=e.transitionTypes=[]),e=0;e<t.length;e++){var i=t[e];n.indexOf(i)===-1&&n.push(i)}}}var Ic=null;function D2(e){var t=e.transitionTypes;return e.transitionTypes=null,t}var Hc=null,Lm=0,kr=0,al=null;function N2(e,t){if(Hc===null){var n=Hc=[];Lm=0,kr=hg(),al={status:"pending",value:void 0,then:function(i){n.push(i)}}}return Lm++,t.then(Ux,Ux),t}function Ux(){if(--Lm===0&&(Ic=null,Hc!==null)){al!==null&&(al.status="fulfilled");var e=Hc;Hc=null,kr=0,al=null;for(var t=0;t<e.length;t++)(0,e[t])()}}function U2(e,t){var n=[],i={status:"pending",value:null,reason:null,then:function(s){n.push(s)}};return e.then(function(){i.status="fulfilled",i.value=t;for(var s=0;s<n.length;s++)(0,n[s])(t)},function(s){for(i.status="rejected",i.reason=s,s=0;s<n.length;s++)(0,n[s])(void 0)}),i}var Lx=se.S;se.S=function(e,t){if(JS=Oi(),typeof t=="object"&&t!==null&&typeof t.then=="function"&&N2(e,t),Ic!==null)for(var n=_l;n!==null;)Nx(n,Ic),n=n.next;if(n=e.types,n!==null){for(var i=_l;i!==null;)Nx(i,n),i=i.next;if(kr!==0){i=Ic,i===null&&(i=Ic=[]);for(var s=0;s<n.length;s++){var a=n[s];i.indexOf(a)===-1&&i.push(a)}}}Lx!==null&&Lx(e,t)};var zr=Gs(null);function B0(){var e=zr.current;return e!==null?e:Ke.pooledCache}function Dh(e,t){t===null?tn(zr,zr.current):tn(zr,t.pool)}function Ib(){var e=B0();return e===null?null:{parent:bn._currentValue,pool:e}}var wl=Error(at(460)),F0=Error(at(474)),wf=Error(at(542)),$h={then:function(){}};function Ox(e){return e=e.status,e==="fulfilled"||e==="rejected"}function Pb(e,t,n){switch(n=e[n],n===void 0?e.push(t):n!==t&&(t.then(Ps,Ps),t=n),t.status){case"fulfilled":return t.value;case"rejected":throw e=t.reason,Px(e),e===void 0&&!("reason"in t)?Error(at(600)):e;default:if(typeof t.status=="string")t.then(Ps,Ps);else{if(e=Ke,e!==null&&100<e.shellSuspendCounter)throw Error(at(482));e=t,e.status="pending",e.then(function(i){if(t.status==="pending"){var s=t;s.status="fulfilled",s.value=i}},function(i){if(t.status==="pending"){var s=t;s.status="rejected",s.reason=i}})}switch(t.status){case"fulfilled":return t.value;case"rejected":throw e=t.reason,Px(e),e}throw Br=t,wl}}function Nr(e){try{var t=e._init;return t(e._payload)}catch(n){throw n!==null&&typeof n=="object"&&typeof n.then=="function"?(Br=n,wl):n}}var Br=null;function Ix(){if(Br===null)throw Error(at(459));var e=Br;return Br=null,e}function Px(e){if(e===wl||e===wf)throw Error(at(483))}var rl=null,nu=0;function fh(e){var t=nu;return nu+=1,rl===null&&(rl=[]),Pb(rl,e,t)}function Va(e,t){t=t.props.ref,e.ref=t!==void 0?t:null}function dh(e,t){throw t.$$typeof===fw?Error(at(525)):(e=Object.prototype.toString.call(t),Error(at(31,e==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":e)))}function zb(e){function t(f,y){if(e){var _=f.deletions;_===null?(f.deletions=[y],f.flags|=16):_.push(y)}}function n(f,y){if(!e)return null;for(;y!==null;)t(f,y),y=y.sibling;return null}function i(f){for(var y=new Map;f!==null;)f.key===null?y.set(f.index,f):y.set(f.key,f),f=f.sibling;return y}function s(f,y){return f=la(f,y),f.index=0,f.sibling=null,f}function a(f,y,_){return f.index=_,e?(_=f.alternate,_!==null?(_=_.index,_<y?(f.flags|=2,y):_):(f.flags|=134217730,y)):(f.flags|=1048576,y)}function r(f){return e&&f.alternate===null&&(f.flags|=134217730),f}function o(f,y,_,b){return y===null||y.tag!==6?(y=qp(_,f.mode,b),y.return=f,y):(y=s(y,_),y.return=f,y)}function l(f,y,_,b){var D=_.type;return D===Wo?(f=u(f,y,_.props.children,b,_.key),Va(f,_),f):y!==null&&(y.elementType===D||typeof D=="object"&&D!==null&&D.$$typeof===Xa&&Nr(D)===y.type)?(y=s(y,_.props),Va(y,_),y.return=f,y):(y=Rh(_.type,_.key,_.props,null,f.mode,b),Va(y,_),y.return=f,y)}function c(f,y,_,b){return y===null||y.tag!==4||y.stateNode.containerInfo!==_.containerInfo||y.stateNode.implementation!==_.implementation?(y=Yp(_,f.mode,b),y.return=f,y):(y=s(y,_.children||[]),y.return=f,y)}function u(f,y,_,b,D){return y===null||y.tag!==7?(y=Pr(_,f.mode,b,D),y.return=f,y):(y=s(y,_),y.return=f,y)}function d(f,y,_){if(typeof y=="string"&&y!==""||typeof y=="number"||typeof y=="bigint")return y=qp(""+y,f.mode,_),y.return=f,y;if(typeof y=="object"&&y!==null){switch(y.$$typeof){case ih:return _=Rh(y.type,y.key,y.props,null,f.mode,_),Va(_,y),_.return=f,_;case Uc:return y=Yp(y,f.mode,_),y.return=f,y;case Xa:return y=Nr(y),d(f,y,_)}if(Lc(y)||Ac(y))return y=Pr(y,f.mode,_,null),y.return=f,y;if(typeof y.then=="function")return d(f,fh(y),_);if(y.$$typeof===Is)return d(f,hh(f,y),_);dh(f,y)}return null}function h(f,y,_,b){var D=y!==null?y.key:null;if(typeof _=="string"&&_!==""||typeof _=="number"||typeof _=="bigint")return D!==null?null:o(f,y,""+_,b);if(typeof _=="object"&&_!==null){switch(_.$$typeof){case ih:return _.key===D?l(f,y,_,b):null;case Uc:return _.key===D?c(f,y,_,b):null;case Xa:return _=Nr(_),h(f,y,_,b)}if(Lc(_)||Ac(_))return D!==null?null:u(f,y,_,b,null);if(typeof _.then=="function")return h(f,y,fh(_),b);if(_.$$typeof===Is)return h(f,y,hh(f,_),b);dh(f,_)}return null}function p(f,y,_,b,D){if(typeof b=="string"&&b!==""||typeof b=="number"||typeof b=="bigint")return f=f.get(_)||null,o(y,f,""+b,D);if(typeof b=="object"&&b!==null){switch(b.$$typeof){case ih:return f=f.get(b.key===null?_:b.key)||null,l(y,f,b,D);case Uc:return f=f.get(b.key===null?_:b.key)||null,c(y,f,b,D);case Xa:return b=Nr(b),p(f,y,_,b,D)}if(Lc(b)||Ac(b))return f=f.get(_)||null,u(y,f,b,D,null);if(typeof b.then=="function")return p(f,y,_,fh(b),D);if(b.$$typeof===Is)return p(f,y,_,hh(y,b),D);dh(y,b)}return null}function g(f,y,_,b){for(var D=null,R=null,A=y,N=y=0,et=null;A!==null&&N<_.length;N++){A.index>N?(et=A,A=null):et=A.sibling;var v=h(f,A,_[N],b);if(v===null){A===null&&(A=et);break}e&&A&&v.alternate===null&&t(f,A),y=a(v,y,N),R===null?D=v:R.sibling=v,R=v,A=et}if(N===_.length)return n(f,A),Me&&ra(f,N),D;if(A===null){for(;N<_.length;N++)A=d(f,_[N],b),A!==null&&(y=a(A,y,N),R===null?D=A:R.sibling=A,R=A);return Me&&ra(f,N),D}for(A=i(A);N<_.length;N++)et=p(A,f,N,_[N],b),et!==null&&(e&&(v=et.alternate,v!==null&&A.delete(v.key===null?N:v.key)),y=a(et,y,N),R===null?D=et:R.sibling=et,R=et);return e&&A.forEach(function(M){return t(f,M)}),Me&&ra(f,N),D}function S(f,y,_,b){if(_==null)throw Error(at(151));for(var D=null,R=null,A=y,N=y=0,et=null,v=_.next();A!==null&&!v.done;N++,v=_.next()){A.index>N?(et=A,A=null):et=A.sibling;var M=h(f,A,v.value,b);if(M===null){A===null&&(A=et);break}e&&A&&M.alternate===null&&t(f,A),y=a(M,y,N),R===null?D=M:R.sibling=M,R=M,A=et}if(v.done)return n(f,A),Me&&ra(f,N),D;if(A===null){for(;!v.done;N++,v=_.next())v=d(f,v.value,b),v!==null&&(y=a(v,y,N),R===null?D=v:R.sibling=v,R=v);return Me&&ra(f,N),D}for(A=i(A);!v.done;N++,v=_.next())v=p(A,f,N,v.value,b),v!==null&&(e&&(et=v.alternate,et!==null&&A.delete(et.key===null?N:et.key)),y=a(v,y,N),R===null?D=v:R.sibling=v,R=v);return e&&A.forEach(function(F){return t(f,F)}),Me&&ra(f,N),D}function m(f,y,_,b){if(typeof _=="object"&&_!==null&&_.type===Wo&&_.key===null&&_.props.ref===void 0&&(_=_.props.children),typeof _=="object"&&_!==null){switch(_.$$typeof){case ih:t:{for(var D=_.key;y!==null;){if(y.key===D){if(D=_.type,D===Wo){if(y.tag===7){n(f,y.sibling),b=s(y,_.props.children),Va(b,_),b.return=f,f=b;break t}}else if(y.elementType===D||typeof D=="object"&&D!==null&&D.$$typeof===Xa&&Nr(D)===y.type){n(f,y.sibling),b=s(y,_.props),Va(b,_),b.return=f,f=b;break t}n(f,y);break}else t(f,y);y=y.sibling}_.type===Wo?(b=Pr(_.props.children,f.mode,b,_.key),Va(b,_),b.return=f,f=b):(b=Rh(_.type,_.key,_.props,null,f.mode,b),Va(b,_),b.return=f,f=b)}return r(f);case Uc:t:{for(D=_.key;y!==null;){if(y.key===D)if(y.tag===4&&y.stateNode.containerInfo===_.containerInfo&&y.stateNode.implementation===_.implementation){n(f,y.sibling),b=s(y,_.children||[]),b.return=f,f=b;break t}else{n(f,y);break}else t(f,y);y=y.sibling}b=Yp(_,f.mode,b),b.return=f,f=b}return r(f);case Xa:return _=Nr(_),m(f,y,_,b)}if(Lc(_))return g(f,y,_,b);if(Ac(_)){if(D=Ac(_),typeof D!="function")throw Error(at(150));return _=D.call(_),S(f,y,_,b)}if(typeof _.then=="function")return m(f,y,fh(_),b);if(_.$$typeof===Is)return m(f,y,hh(f,_),b);dh(f,_)}return typeof _=="string"&&_!==""||typeof _=="number"||typeof _=="bigint"?(_=""+_,y!==null&&y.tag===6?(n(f,y.sibling),b=s(y,_),b.return=f,f=b):(n(f,y),b=qp(_,f.mode,b),b.return=f,f=b),r(f)):n(f,y)}return function(f,y,_,b){try{nu=0;var D=m(f,y,_,b);return rl=null,D}catch(A){if(A===wl||A===wf)throw A;var R=bi(29,A,null,f.mode);return R.lanes=b,R.return=f,R}}}var Xr=zb(!0),Bb=zb(!1),Wa=!1;function H0(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,lanes:0,hiddenCallbacks:null},callbacks:null}}function Om(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,callbacks:null})}function er(e){return{lane:e,tag:0,payload:null,callback:null,next:null}}function nr(e,t,n){var i=e.updateQueue;if(i===null)return null;if(i=i.shared,(Ue&2)!==0){var s=i.pending;return s===null?t.next=t:(t.next=s.next,s.next=t),i.pending=t,t=Kh(e),Cb(e,null,n),t}return Tf(e,i,t,n),Kh(e)}function Vc(e,t,n){if(t=t.updateQueue,t!==null&&(t=t.shared,(n&4194048)!==0)){var i=t.lanes;i&=e.pendingLanes,n|=i,t.lanes=n,eb(e,n)}}function Kp(e,t){var n=e.updateQueue,i=e.alternate;if(i!==null&&(i=i.updateQueue,n===i)){var s=null,a=null;if(n=n.firstBaseUpdate,n!==null){do{var r={lane:n.lane,tag:n.tag,payload:n.payload,callback:null,next:null};a===null?s=a=r:a=a.next=r,n=n.next}while(n!==null);a===null?s=a=t:a=a.next=t}else s=a=t;n={baseState:i.baseState,firstBaseUpdate:s,lastBaseUpdate:a,shared:i.shared,callbacks:i.callbacks},e.updateQueue=n;return}e=n.lastBaseUpdate,e===null?n.firstBaseUpdate=t:e.next=t,n.lastBaseUpdate=t}var Im=!1;function Gc(){if(Im){var e=al;if(e!==null)throw e}}function kc(e,t,n,i){Im=!1;var s=e.updateQueue;Wa=!1;var a=s.firstBaseUpdate,r=s.lastBaseUpdate,o=s.shared.pending;if(o!==null){s.shared.pending=null;var l=o,c=l.next;l.next=null,r===null?a=c:r.next=c,r=l;var u=e.alternate;u!==null&&(u=u.updateQueue,o=u.lastBaseUpdate,o!==r&&(o===null?u.firstBaseUpdate=c:o.next=c,u.lastBaseUpdate=l))}if(a!==null){var d=s.baseState;r=0,u=c=l=null,o=a;do{var h=o.lane&-536870913,p=h!==o.lane;if(p?(Ce&h)===h:(i&h)===h){h!==0&&h===kr&&(Im=!0),u!==null&&(u=u.next={lane:0,tag:o.tag,payload:o.payload,callback:null,next:null});t:{var g=e,S=o;h=t;var m=n;switch(S.tag){case 1:if(g=S.payload,typeof g=="function"){d=g.call(m,d,h);break t}d=g;break t;case 3:g.flags=g.flags&-65537|128;case 0:if(g=S.payload,h=typeof g=="function"?g.call(m,d,h):g,h==null)break t;d=je({},d,h);break t;case 2:Wa=!0}}h=o.callback,h!==null&&(e.flags|=64,p&&(e.flags|=8192),p=s.callbacks,p===null?s.callbacks=[h]:p.push(h))}else p={lane:h,tag:o.tag,payload:o.payload,callback:o.callback,next:null},u===null?(c=u=p,l=d):u=u.next=p,r|=h;if(o=o.next,o===null){if(o=s.shared.pending,o===null)break;p=o,o=p.next,p.next=null,s.lastBaseUpdate=p,s.shared.pending=null}}while(!0);u===null&&(l=d),s.baseState=l,s.firstBaseUpdate=c,s.lastBaseUpdate=u,a===null&&(s.shared.lanes=0),dr|=r,e.lanes=r,e.memoizedState=d}}function Fb(e,t){if(typeof e!="function")throw Error(at(191,e));e.call(t)}function Hb(e,t){var n=e.callbacks;if(n!==null)for(e.callbacks=null,e=0;e<n.length;e++)Fb(n[e],t)}var hr=Gs(null),tf=Gs(0);function zx(e,t){e=ma,tn(tf,e),tn(hr,t),ma=e|t.baseLanes}function Pm(){tn(tf,ma),tn(hr,hr.current)}function V0(){ma=tf.current,Xn(hr),Xn(tf)}var Yn=Gs(null),$n=null;function ir(e){var t=e.alternate;tn(Wn,Wn.current&1),tn(Yn,e),$n===null&&(t===null||hr.current!==null||t.memoizedState!==null)&&($n=e)}function zm(e){tn(Wn,Wn.current),tn(Yn,e),$n===null&&($n=e)}function Vb(e){e.tag===22?(tn(Wn,Wn.current),tn(Yn,e),$n===null&&($n=e)):sr()}function sr(){tn(Wn,Wn.current),tn(Yn,Yn.current)}function Ni(e){Xn(Yn),$n===e&&($n=null),Xn(Wn)}var Wn=Gs(0);function iu(e,t){tn(Yn,Yn.current),tn(Wn,t)}function G0(e){Xn(Wn),Xn(Yn),$n===e&&($n=null)}function ef(e){for(var t=e;t!==null;){if(t.tag===13){var n=t.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||v0(n)||mg(n)))return t}else if(t.tag===19&&t.memoizedProps.revealOrder!=="independent"){if((t.flags&128)!==0)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}var fa=0,he=null,We=null,xn=null,nf=!1,ol=!1,Wr=!1,sf=0,su=0,ll=null,L2=0;function fn(){throw Error(at(321))}function k0(e,t){if(t===null)return!1;for(var n=0;n<t.length&&n<e.length;n++)if(!Bi(e[n],t[n]))return!1;return!0}function X0(e,t,n,i,s,a){return fa=a,he=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,se.H=e===null||e.memoizedState===null?yS:_S,Wr=!1,a=n(i,s),Wr=!1,ol&&(a=kb(t,n,i,s)),Gb(e),a}function Gb(e){se.H=af;var t=We!==null&&We.next!==null;if(fa=0,xn=We=he=null,nf=!1,su=0,ll=null,t)throw Error(at(300));e===null||Sn||(e=e.dependencies,e!==null&&Jh(e)&&(Sn=!0))}function kb(e,t,n,i){he=e;var s=0;do{if(ol&&(ll=null),su=0,ol=!1,25<=s)throw Error(at(301));if(s+=1,xn=We=null,e.updateQueue!=null){var a=e.updateQueue;a.lastEffect=null,a.events=null,a.stores=null,a.memoCache!=null&&(a.memoCache.index=0)}se.H=V2,a=t(n,i)}while(ol);return a}function O2(){var e=se.H,t=e.useState()[0];return t=typeof t.then=="function"?_u(t):t,e=e.useState()[0],(We!==null?We.memoizedState:null)!==e&&(he.flags|=1024),t}function W0(){var e=sf!==0;return sf=0,e}function q0(e,t,n){t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~n}function Y0(e){if(nf){for(e=e.memoizedState;e!==null;){var t=e.queue;t!==null&&(t.pending=null),e=e.next}nf=!1}fa=0,xn=We=he=null,ol=!1,su=sf=0,ll=null}function hi(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return xn===null?he.memoizedState=xn=e:xn=xn.next=e,xn}function vn(){if(We===null){var e=he.alternate;e=e!==null?e.memoizedState:null}else e=We.next;var t=xn===null?he.memoizedState:xn.next;if(t!==null)xn=t,We=e;else{if(e===null)throw he.alternate===null?Error(at(467)):Error(at(310));We=e,e={memoizedState:We.memoizedState,baseState:We.baseState,baseQueue:We.baseQueue,queue:We.queue,next:null},xn===null?he.memoizedState=xn=e:xn=xn.next=e}return xn}function Rf(){return{lastEffect:null,events:null,stores:null,memoCache:null}}function _u(e){var t=su;return su+=1,ll===null&&(ll=[]),e=Pb(ll,e,t),t=he,(xn===null?t.memoizedState:xn.next)===null&&(t=t.alternate,se.H=t===null||t.memoizedState===null?yS:_S),e}function Cf(e){if(e!==null&&typeof e=="object"){if(typeof e.then=="function")return _u(e);if(e.$$typeof===mw)return;if(e.$$typeof===Is)return kn(e)}throw Error(at(438,String(e)))}function Z0(e){var t=null,n=he.updateQueue;if(n!==null&&(t=n.memoCache),t==null){var i=he.alternate;i!==null&&(i=i.updateQueue,i!==null&&(i=i.memoCache,i!=null&&(t={data:i.data.map(function(s){return s.slice()}),index:0})))}if(t==null&&(t={data:[],index:0}),n===null&&(n=Rf(),he.updateQueue=n),n.memoCache=t,n=t.data[t.index],n===void 0)for(n=t.data[t.index]=Array(e),i=0;i<e;i++)n[i]=pw;return t.index++,n}function da(e,t){return typeof t=="function"?t(e):t}function Nh(e){var t=vn();return K0(t,We,e)}function K0(e,t,n){var i=e.queue;if(i===null)throw Error(at(311));i.lastRenderedReducer=n;var s=e.baseQueue,a=i.pending;if(a!==null){if(s!==null){var r=s.next;s.next=a.next,a.next=r}t.baseQueue=s=a,i.pending=null}if(a=e.baseState,s===null)e.memoizedState=a;else{t=s.next;var o=r=null,l=null,c=t,u=!1;do{var d=c.lane&-536870913;if(d!==c.lane?(Ce&d)===d:(fa&d)===d){var h=c.revertLane;if(h===0)l!==null&&(l=l.next={lane:0,revertLane:0,gesture:null,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null}),d===kr&&(u=!0);else if((fa&h)===h){c=c.next,h===kr&&(u=!0);continue}else d={lane:0,revertLane:c.revertLane,gesture:null,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null},l===null?(o=l=d,r=a):l=l.next=d,he.lanes|=h,dr|=h;d=c.action,Wr&&n(a,d),a=c.hasEagerState?c.eagerState:n(a,d)}else h={lane:d,revertLane:c.revertLane,gesture:c.gesture,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null},l===null?(o=l=h,r=a):l=l.next=h,he.lanes|=d,dr|=d;c=c.next}while(c!==null&&c!==t);if(l===null?r=a:l.next=o,!Bi(a,e.memoizedState)&&(Sn=!0,u&&(n=al,n!==null)))throw n;e.memoizedState=a,e.baseState=r,e.baseQueue=l,i.lastRenderedState=a}return s===null&&(i.lanes=0),[e.memoizedState,i.dispatch]}function jp(e){var t=vn(),n=t.queue;if(n===null)throw Error(at(311));n.lastRenderedReducer=e;var i=n.dispatch,s=n.pending,a=t.memoizedState;if(s!==null){n.pending=null;var r=s=s.next;do a=e(a,r.action),r=r.next;while(r!==s);Bi(a,t.memoizedState)||(Sn=!0),t.memoizedState=a,t.baseQueue===null&&(t.baseState=a),n.lastRenderedState=a}return[a,i]}function Xb(e,t,n){var i=he,s=vn(),a=Me;if(a){if(n===void 0)throw Error(at(407));n=n()}else n=t();var r=!Bi((We||s).memoizedState,n);if(r&&(s.memoizedState=n,Sn=!0),s=s.queue,j0(Yb.bind(null,i,s,e),[e]),e=s.getSnapshot!==t||r||xn!==null&&(xn.memoizedState.tag&1)!==0,ml(e?9:8,{destroy:void 0},qb.bind(null,i,s,n,t),null),e){if(i.flags|=2048,Ke===null)throw Error(at(349));a||(fa&127)!==0||Wb(i,t,n)}return n}function Wb(e,t,n){e.flags|=16384,e={getSnapshot:t,value:n},t=he.updateQueue,t===null?(t=Rf(),he.updateQueue=t,t.stores=[e]):(n=t.stores,n===null?t.stores=[e]:n.push(e))}function qb(e,t,n,i){t.value=n,t.getSnapshot=i,Zb(t)&&Kb(e)}function Yb(e,t,n){return n(function(){Zb(t)&&Kb(e)})}function Zb(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!Bi(e,n)}catch{return!0}}function Kb(e){var t=Qr(e,2);t!==null&&Si(t,e,2)}function Bm(e){var t=hi();if(typeof e=="function"){var n=e;if(e=n(),Wr){Ya(!0);try{n()}finally{Ya(!1)}}}return t.memoizedState=t.baseState=e,t.queue={pending:null,lanes:0,dispatch:null,lastRenderedReducer:da,lastRenderedState:e},t}function jb(e,t,n,i){return e.baseState=n,K0(e,We,typeof i=="function"?i:da)}function I2(e,t,n,i,s){if(Nf(e))throw Error(at(485));if(e=t.action,e!==null){var a={payload:s,action:e,next:null,isTransition:!0,status:"pending",value:null,reason:null,listeners:[],then:function(r){a.listeners.push(r)}};se.T!==null?n(!0):a.isTransition=!1,i(a),n=t.pending,n===null?(a.next=t.pending=a,Qb(t,a)):(a.next=n.next,t.pending=n.next=a)}}function Qb(e,t){var n=t.action,i=t.payload,s=e.state;if(t.isTransition){var a=se.T,r={};r.types=a!==null?a.types:null,se.T=r;try{var o=n(s,i),l=se.S;l!==null&&l(r,o),Bx(e,t,o)}catch(c){Fm(e,t,c)}finally{a!==null&&r.types!==null&&(a.types=r.types),se.T=a}}else try{a=n(s,i),Bx(e,t,a)}catch(c){Fm(e,t,c)}}function Bx(e,t,n){n!==null&&typeof n=="object"&&typeof n.then=="function"?n.then(function(i){Fx(e,t,i)},function(i){return Fm(e,t,i)}):Fx(e,t,n)}function Fx(e,t,n){t.status="fulfilled",t.value=n,Jb(t),e.state=n,t=e.pending,t!==null&&(n=t.next,n===t?e.pending=null:(n=n.next,t.next=n,Qb(e,n)))}function Fm(e,t,n){var i=e.pending;if(e.pending=null,i!==null){i=i.next;do t.status="rejected",t.reason=n,Jb(t),t=t.next;while(t!==i)}e.action=null}function Jb(e){e=e.listeners;for(var t=0;t<e.length;t++)(0,e[t])()}function $b(e,t){return t}function Hx(e,t){if(Me){var n=Ke.formState;if(n!==null){t:{var i=he;if(Me){if($e){e:{for(var s=$e,a=$i;s.nodeType!==8;){if(!a){s=null;break e}if(s=ts(s.nextSibling),s===null){s=null;break e}}a=s.data,s=a==="F!"||a==="F"?s:null}if(s){$e=ts(s.nextSibling),i=s.data==="F!";break t}}ur(i)}i=!1}i&&(t=n[0])}}return n=hi(),n.memoizedState=n.baseState=t,i={pending:null,lanes:0,dispatch:null,lastRenderedReducer:$b,lastRenderedState:t},n.queue=i,n=mS.bind(null,he,i),i.dispatch=n,i=Bm(!1),a=tg.bind(null,he,!1,i.queue),i=hi(),s={state:t,dispatch:null,action:e,pending:null},i.queue=s,n=I2.bind(null,he,s,a,n),s.dispatch=n,i.memoizedState=e,[t,n,!1]}function Vx(e){var t=vn();return tS(t,We,e)}function tS(e,t,n){if(t=K0(e,t,$b)[0],e=Nh(da)[0],typeof t=="object"&&t!==null&&typeof t.then=="function")try{var i=_u(t)}catch(r){throw r===wl?wf:r}else i=t;t=vn();var s=t.queue,a=s.dispatch;return n!==t.memoizedState&&(he.flags|=2048,ml(9,{destroy:void 0},P2.bind(null,s,n),null)),[i,a,e]}function P2(e,t){e.action=t}function Gx(e){var t=vn(),n=We;if(n!==null)return tS(t,n,e);vn(),t=t.memoizedState,n=vn();var i=n.queue.dispatch;return n.memoizedState=e,[t,i,!1]}function ml(e,t,n,i){return e={tag:e,create:n,deps:i,inst:t,next:null},t=he.updateQueue,t===null&&(t=Rf(),he.updateQueue=t),n=t.lastEffect,n===null?t.lastEffect=e.next=e:(i=n.next,n.next=e,e.next=i,t.lastEffect=e),e}function eS(){return vn().memoizedState}function Uh(e,t,n,i){var s=hi();he.flags|=e,s.memoizedState=ml(1|t,{destroy:void 0},n,i===void 0?null:i)}function Df(e,t,n,i){var s=vn();i=i===void 0?null:i;var a=s.memoizedState.inst;We!==null&&i!==null&&k0(i,We.memoizedState.deps)?s.memoizedState=ml(t,a,n,i):(he.flags|=e,s.memoizedState=ml(1|t,a,n,i))}function kx(e,t){Uh(8390656,8,e,t)}function j0(e,t){Df(2048,8,e,t)}function z2(e){he.flags|=4;var t=he.updateQueue;if(t===null)t=Rf(),he.updateQueue=t,t.events=[e];else{var n=t.events;n===null?t.events=[e]:n.push(e)}}function nS(e){var t=vn().memoizedState;return z2({ref:t,nextImpl:e}),function(){if((Ue&2)!==0)throw Error(at(440));return t.impl.apply(void 0,arguments)}}function iS(e,t){return Df(4,2,e,t)}function sS(e,t){return Df(4,4,e,t)}function aS(e,t){if(typeof t=="function"){e=e();var n=t(e);return function(){typeof n=="function"?n():t(null)}}if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function rS(e,t,n){n=n!=null?n.concat([e]):null,Df(4,4,aS.bind(null,t,e),n)}function Q0(){}function oS(e,t){var n=vn();t=t===void 0?null:t;var i=n.memoizedState;return t!==null&&k0(t,i[1])?i[0]:(n.memoizedState=[e,t],e)}function lS(e,t){var n=vn();t=t===void 0?null:t;var i=n.memoizedState;if(t!==null&&k0(t,i[1]))return i[0];if(i=e(),Wr){Ya(!0);try{e()}finally{Ya(!1)}}return n.memoizedState=[i,t],i}function J0(e,t,n){return n===void 0||(fa&1073741824)!==0&&(Ce&261930)===0?e.memoizedState=t:(e.memoizedState=n,e=tM(),he.lanes|=e,dr|=e,n)}function cS(e,t,n,i){return Bi(n,t)?n:hr.current!==null?(e=J0(e,n,i),Bi(e,t)||(Sn=!0),e):(fa&106)===0||(fa&1073741824)!==0&&(Ce&261930)===0?(Sn=!0,e.memoizedState=n):(e=tM(),he.lanes|=e,dr|=e,t)}function uS(e,t,n,i,s){var a=Le.p;Le.p=a!==0&&8>a?a:8;var r=se.T,o={};o.types=r!==null?r.types:null,se.T=o,tg(e,!1,t,n);try{var l=s(),c=se.S;if(c!==null&&c(o,l),l!==null&&typeof l=="object"&&typeof l.then=="function"){var u=U2(l,i);Xc(e,t,u,zi(e))}else Xc(e,t,i,zi(e))}catch(d){Xc(e,t,{then:function(){},status:"rejected",reason:d},zi())}finally{Le.p=a,r!==null&&o.types!==null&&(r.types=o.types),se.T=r}}function B2(){}function Hm(e,t,n,i){if(e.tag!==5)throw Error(at(476));var s=hS(e).queue;uS(e,s,t,Ir,n===null?B2:function(){return fS(e),n(i)})}function hS(e){var t=e.memoizedState;if(t!==null)return t;t={memoizedState:Ir,baseState:Ir,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:da,lastRenderedState:Ir},next:null};var n={};return t.next={memoizedState:n,baseState:n,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:da,lastRenderedState:n},next:null},e.memoizedState=t,e=e.alternate,e!==null&&(e.memoizedState=t),t}function fS(e){var t=hS(e);t.next===null&&(t=e.alternate.memoizedState),Xc(e,t.next.queue,{},zi())}function $0(){return kn(Sl)}function dS(){return vn().memoizedState}function pS(){return vn().memoizedState}function F2(e){for(var t=e.return;t!==null;){switch(t.tag){case 24:case 3:var n=zi();e=er(n);var i=nr(t,e,n);i!==null&&(Si(i,t,n),Vc(i,t,n)),t={cache:z0()},e.payload=t;return}t=t.return}}function H2(e,t,n){var i=zi();n={lane:i,revertLane:0,gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null},Nf(e)?gS(t,n):(n=O0(e,t,n,i),n!==null&&(Si(n,e,i),vS(n,t,i)))}function mS(e,t,n){var i=zi();Xc(e,t,n,i)}function Xc(e,t,n,i){var s={lane:i,revertLane:0,gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null};if(Nf(e))gS(t,s);else{var a=e.alternate;if(e.lanes===0&&(a===null||a.lanes===0)&&(a=t.lastRenderedReducer,a!==null))try{var r=t.lastRenderedState,o=a(r,n);if(s.hasEagerState=!0,s.eagerState=o,Bi(o,r))return Tf(e,t,s,0),Ke===null&&Ef(),!1}catch{}if(n=O0(e,t,s,i),n!==null)return Si(n,e,i),vS(n,t,i),!0}return!1}function tg(e,t,n,i){if(i={lane:2,revertLane:hg(),gesture:null,action:i,hasEagerState:!1,eagerState:null,next:null},Nf(e)){if(t)throw Error(at(479))}else t=O0(e,n,i,2),t!==null&&Si(t,e,2)}function Nf(e){var t=e.alternate;return e===he||t!==null&&t===he}function gS(e,t){ol=nf=!0;var n=e.pending;n===null?t.next=t:(t.next=n.next,n.next=t),e.pending=t}function vS(e,t,n){if((n&4194048)!==0){var i=t.lanes;i&=e.pendingLanes,n|=i,t.lanes=n,eb(e,n)}}var af={readContext:kn,use:Cf,useCallback:fn,useContext:fn,useEffect:fn,useImperativeHandle:fn,useLayoutEffect:fn,useInsertionEffect:fn,useMemo:fn,useReducer:fn,useRef:fn,useState:fn,useDebugValue:fn,useDeferredValue:fn,useTransition:fn,useSyncExternalStore:fn,useId:fn,useHostTransitionStatus:fn,useFormState:fn,useActionState:fn,useOptimistic:fn,useMemoCache:fn,useCacheRefresh:fn,useEffectEvent:fn},yS={readContext:kn,use:Cf,useCallback:function(e,t){return hi().memoizedState=[e,t===void 0?null:t],e},useContext:kn,useEffect:kx,useImperativeHandle:function(e,t,n){n=n!=null?n.concat([e]):null,Uh(4194308,4,aS.bind(null,t,e),n)},useLayoutEffect:function(e,t){return Uh(4194308,4,e,t)},useInsertionEffect:function(e,t){Uh(4,2,e,t)},useMemo:function(e,t){var n=hi();t=t===void 0?null:t;var i=e();if(Wr){Ya(!0);try{e()}finally{Ya(!1)}}return n.memoizedState=[i,t],i},useReducer:function(e,t,n){var i=hi();if(n!==void 0){var s=n(t);if(Wr){Ya(!0);try{n(t)}finally{Ya(!1)}}}else s=t;return i.memoizedState=i.baseState=s,e={pending:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:s},i.queue=e,e=e.dispatch=H2.bind(null,he,e),[i.memoizedState,e]},useRef:function(e){var t=hi();return e={current:e},t.memoizedState=e},useState:function(e){e=Bm(e);var t=e.queue,n=mS.bind(null,he,t);return t.dispatch=n,[e.memoizedState,n]},useDebugValue:Q0,useDeferredValue:function(e,t){var n=hi();return J0(n,e,t)},useTransition:function(){var e=Bm(!1);return e=uS.bind(null,he,e.queue,!0,!1),hi().memoizedState=e,[!1,e]},useSyncExternalStore:function(e,t,n){var i=he,s=hi();if(Me){if(n===void 0)throw Error(at(407));n=n()}else{if(n=t(),Ke===null)throw Error(at(349));(Ce&127)!==0||Wb(i,t,n)}s.memoizedState=n;var a={value:n,getSnapshot:t};return s.queue=a,kx(Yb.bind(null,i,a,e),[e]),i.flags|=2048,ml(9,{destroy:void 0},qb.bind(null,i,a,n,t),null),n},useId:function(){var e=hi(),t=Ke.identifierPrefix;if(Me){var n=Bs,i=zs;n=(i&~(1<<32-Pi(i)-1)).toString(32)+n,t="_"+t+"R_"+n,n=sf++,0<n&&(t+="H"+n.toString(32)),t+="_"}else n=L2++,t="_"+t+"r_"+n.toString(32)+"_";return e.memoizedState=t},useHostTransitionStatus:$0,useFormState:Hx,useActionState:Hx,useOptimistic:function(e){var t=hi();t.memoizedState=t.baseState=e;var n={pending:null,lanes:0,dispatch:null,lastRenderedReducer:null,lastRenderedState:null};return t.queue=n,t=tg.bind(null,he,!0,n),n.dispatch=t,[e,t]},useMemoCache:Z0,useCacheRefresh:function(){return hi().memoizedState=F2.bind(null,he)},useEffectEvent:function(e){var t=hi(),n={impl:e};return t.memoizedState=n,function(){if((Ue&2)!==0)throw Error(at(440));return n.impl.apply(void 0,arguments)}}},_S={readContext:kn,use:Cf,useCallback:oS,useContext:kn,useEffect:j0,useImperativeHandle:rS,useInsertionEffect:iS,useLayoutEffect:sS,useMemo:lS,useReducer:Nh,useRef:eS,useState:function(){return Nh(da)},useDebugValue:Q0,useDeferredValue:function(e,t){var n=vn();return cS(n,We.memoizedState,e,t)},useTransition:function(){var e=Nh(da)[0],t=vn().memoizedState;return[typeof e=="boolean"?e:_u(e),t]},useSyncExternalStore:Xb,useId:dS,useHostTransitionStatus:$0,useFormState:Vx,useActionState:Vx,useOptimistic:function(e,t){var n=vn();return jb(n,We,e,t)},useMemoCache:Z0,useCacheRefresh:pS,useEffectEvent:nS},V2={readContext:kn,use:Cf,useCallback:oS,useContext:kn,useEffect:j0,useImperativeHandle:rS,useInsertionEffect:iS,useLayoutEffect:sS,useMemo:lS,useReducer:jp,useRef:eS,useState:function(){return jp(da)},useDebugValue:Q0,useDeferredValue:function(e,t){var n=vn();return We===null?J0(n,e,t):cS(n,We.memoizedState,e,t)},useTransition:function(){var e=jp(da)[0],t=vn().memoizedState;return[typeof e=="boolean"?e:_u(e),t]},useSyncExternalStore:Xb,useId:dS,useHostTransitionStatus:$0,useFormState:Gx,useActionState:Gx,useOptimistic:function(e,t){var n=vn();return We!==null?jb(n,We,e,t):(n.baseState=e,[e,n.queue.dispatch])},useMemoCache:Z0,useCacheRefresh:pS,useEffectEvent:nS};function Qp(e,t,n,i){t=e.memoizedState,n=n(i,t),n=n==null?t:je({},t,n),e.memoizedState=n,e.lanes===0&&(e.updateQueue.baseState=n)}var Vm={enqueueSetState:function(e,t,n){e=e._reactInternals;var i=zi(),s=er(i);s.payload=t,n!=null&&(s.callback=n),t=nr(e,s,i),t!==null&&(Si(t,e,i),Vc(t,e,i))},enqueueReplaceState:function(e,t,n){e=e._reactInternals;var i=zi(),s=er(i);s.tag=1,s.payload=t,n!=null&&(s.callback=n),t=nr(e,s,i),t!==null&&(Si(t,e,i),Vc(t,e,i))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var n=zi(),i=er(n);i.tag=2,t!=null&&(i.callback=t),t=nr(e,i,n),t!==null&&(Si(t,e,n),Vc(t,e,n))}};function Xx(e,t,n,i,s,a,r){return e=e.stateNode,typeof e.shouldComponentUpdate=="function"?e.shouldComponentUpdate(i,a,r):t.prototype&&t.prototype.isPureReactComponent?!$c(n,i)||!$c(s,a):!0}function Wx(e,t,n,i){e=t.state,typeof t.componentWillReceiveProps=="function"&&t.componentWillReceiveProps(n,i),typeof t.UNSAFE_componentWillReceiveProps=="function"&&t.UNSAFE_componentWillReceiveProps(n,i),t.state!==e&&Vm.enqueueReplaceState(t,t.state,null)}function qr(e,t){var n=t;if("ref"in t){n={};for(var i in t)i!=="ref"&&(n[i]=t[i])}if(e=e.defaultProps){n===t&&(n=je({},n));for(var s in e)n[s]===void 0&&(n[s]=e[s])}return n}function xS(e){Zh(e)}function bS(e){console.error(e)}function SS(e){Zh(e)}function rf(e,t){try{var n=e.onUncaughtError;n(t.value,{componentStack:t.stack})}catch(i){setTimeout(function(){throw i})}}function qx(e,t,n){try{var i=e.onCaughtError;i(n.value,{componentStack:n.stack,errorBoundary:t.tag===1?t.stateNode:null})}catch(s){setTimeout(function(){throw s})}}function Gm(e,t,n){return n=er(n),n.tag=3,n.payload={element:null},n.callback=function(){rf(e,t)},n}function MS(e){return e=er(e),e.tag=3,e}function ES(e,t,n,i){var s=n.type.getDerivedStateFromError;if(typeof s=="function"){var a=i.value;e.payload=function(){return s(a)},e.callback=function(){qx(t,n,i)}}var r=n.stateNode;r!==null&&typeof r.componentDidCatch=="function"&&(e.callback=function(){qx(t,n,i),typeof s!="function"&&(ar===null?ar=new Set([this]):ar.add(this));var o=i.stack;this.componentDidCatch(i.value,{componentStack:o!==null?o:""})})}function G2(e,t,n,i,s){if(n.flags|=32768,i!==null&&typeof i=="object"&&typeof i.then=="function"){if(t=n.alternate,t!==null&&Vr(t,n,s,!0),n=Yn.current,n!==null){switch(n.tag){case 31:case 13:case 19:return $n===null?pf():n.alternate===null&&dn===0&&(dn=3),n.flags&=-257,n.flags|=65536,n.lanes=s,i===$h?n.flags|=16384:(t=n.updateQueue,t===null?n.updateQueue=new Set([i]):t.add(i),sm(e,i,s)),!1;case 22:return n.flags|=65536,i===$h?n.flags|=16384:(t=n.updateQueue,t===null?(t={transitions:null,markerInstances:null,retryQueue:new Set([i])},n.updateQueue=t):(n=t.retryQueue,n===null?t.retryQueue=new Set([i]):n.add(i)),sm(e,i,s)),!1}throw Error(at(435,n.tag))}return sm(e,i,s),pf(),!1}if(Me)return t=Yn.current,t!==null?((t.flags&65536)===0&&(t.flags|=256),t.flags|=65536,t.lanes=s,i!==Dm&&(e=Error(at(422),{cause:i}),eu(Ji(e,n)))):(i!==Dm&&(t=Error(at(423),{cause:i}),eu(Ji(t,n))),e=e.current.alternate,e.flags|=65536,s&=-s,e.lanes|=s,i=Ji(i,n),s=Gm(e.stateNode,i,s),Kp(e,s),dn!==4&&(dn=2)),!1;var a=Error(at(520),{cause:i});if(a=Ji(a,n),Zc===null?Zc=[a]:Zc.push(a),dn!==4&&(dn=2),t===null)return!0;i=Ji(i,n),n=t;do{switch(n.tag){case 3:return n.flags|=65536,e=s&-s,n.lanes|=e,e=Gm(n.stateNode,i,e),Kp(n,e),!1;case 1:if(t=n.type,a=n.stateNode,(n.flags&128)===0&&(typeof t.getDerivedStateFromError=="function"||a!==null&&typeof a.componentDidCatch=="function"&&(ar===null||!ar.has(a))))return n.flags|=65536,s&=-s,n.lanes|=s,s=MS(s),ES(s,e,n,i),Kp(n,s),!1;break;case 22:if(n.memoizedState!==null)return n.flags|=65536,!1}n=n.return}while(n!==null);return!1}var eg=Error(at(461)),Sn=!1;function Tn(e,t,n,i){t.child=e===null?Bb(t,null,n,i):Xr(t,e.child,n,i)}function Yx(e,t,n,i,s){n=n.render;var a=t.ref;if("ref"in i){var r={};for(var o in i)o!=="ref"&&(r[o]=i[o])}else r=i;return Gr(t),i=X0(e,t,n,r,a,s),o=W0(),e!==null&&!Sn?(q0(e,t,s),pa(e,t,s)):(Me&&o&&Af(t),t.flags|=1,Tn(e,t,i,s),t.child)}function Zx(e,t,n,i,s){if(e===null){var a=n.type;return typeof a=="function"&&!I0(a)&&a.defaultProps===void 0&&n.compare===null?(t.tag=15,t.type=a,TS(e,t,a,i,s)):(e=Rh(n.type,null,i,t,t.mode,s),e.ref=t.ref,e.return=t,t.child=e)}if(a=e.child,!ig(e,s)){var r=a.memoizedProps;if(n=n.compare,n=n!==null?n:$c,n(r,i)&&e.ref===t.ref)return pa(e,t,s)}return t.flags|=1,e=la(a,i),e.ref=t.ref,e.return=t,t.child=e}function TS(e,t,n,i,s){if(e!==null){var a=e.memoizedProps;if($c(a,i)&&e.ref===t.ref)if(Sn=!1,t.pendingProps=i=a,ig(e,s))(e.flags&131072)!==0&&(Sn=!0);else return t.lanes=e.lanes,pa(e,t,s)}return km(e,t,n,i,s)}function AS(e,t,n,i){var s=i.children,a=e!==null?e.memoizedState:null;if(e===null&&t.stateNode===null&&(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),i.mode==="hidden"){if((t.flags&128)!==0){if(a=a!==null?a.baseLanes|n:n,e!==null){for(i=t.child=e.child,s=0;i!==null;)s=s|i.lanes|i.childLanes,i=i.sibling;i=s&~a}else i=0,t.child=null;return Kx(e,t,a,n,i)}if((n&536870912)!==0)t.memoizedState={baseLanes:0,cachePool:null},e!==null&&Dh(t,a!==null?a.cachePool:null),a!==null?zx(t,a):Pm(),Vb(t);else return i=t.lanes=536870912,Kx(e,t,a!==null?a.baseLanes|n:n,n,i)}else a!==null?(Dh(t,a.cachePool),zx(t,a),sr(),t.memoizedState=null):(e!==null&&Dh(t,null),Pm(),sr());return Tn(e,t,s,n),t.child}function Wc(e,t){return e!==null&&e.tag===22||t.stateNode!==null||(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),t.sibling}function Kx(e,t,n,i,s){var a=B0();return a=a===null?null:{parent:bn._currentValue,pool:a},t.memoizedState={baseLanes:n,cachePool:a},e!==null&&Dh(t,null),Pm(),Vb(t),e!==null&&Vr(e,t,i,!0),t.childLanes=s,null}function Lh(e,t){return t=Uf({mode:t.mode,children:t.children},e.mode),t.ref=e.ref,e.child=t,t.return=e,t}function jx(e,t,n){return Xr(t,e.child,null,n),e=Lh(t,t.pendingProps),e.flags|=2,Ni(t),t.memoizedState=null,e}function k2(e,t,n){var i=t.pendingProps,s=(t.flags&128)!==0;if(t.flags&=-129,e===null){if(Me){if(i.mode==="hidden")return e=Lh(t,i),t.lanes=536870912,e.memoizedState={baseLanes:0,cachePool:null},Wc(null,e);if(zm(t),(e=$e)?(e=AM(e,$i),e=e!==null&&e.data==="&"?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:cr!==null?{id:zs,overflow:Bs}:null,retryLane:536870912,hydrationErrors:null},n=Nb(e),n.return=t,t.child=n,Bn=t,$e=null)):e=null,e===null)throw ur(t);return t.lanes=536870912,null}return Lh(t,i)}var a=e.memoizedState;if(a!==null){var r=a.dehydrated;if(zm(t),s)if(t.flags&256)t.flags&=-257,t=jx(e,t,n);else if(t.memoizedState!==null)t.child=e.child,t.flags|=128,t=null;else throw Error(at(558));else if(Sn||Vr(e,t,n,!1),s=(n&e.childLanes)!==0,Sn||s){if(hr.current===null){if(i=Ke,i!==null&&(r=nb(i,n),r!==0&&r!==a.retryLane))throw a.retryLane=r,Qr(e,r),Si(i,e,r),eg;pf()}t=jx(e,t,n)}else e=a.treeContext,$e=ts(r.nextSibling),Bn=t,Me=!0,tr=null,$i=!1,e!==null&&Lb(t,e),t=Lh(t,i),t.flags|=134221824;return t}return e=la(e.child,{mode:i.mode,children:i.children}),e.ref=t.ref,t.child=e,e.return=t,e}function Vo(e,t){var n=t.ref;if(n===null)e!==null&&e.ref!==null&&(t.flags|=4194816);else{if(typeof n!="function"&&typeof n!="object")throw Error(at(284));(e===null||e.ref!==n)&&(t.flags|=4194816)}}function km(e,t,n,i,s){return Gr(t),n=X0(e,t,n,i,void 0,s),i=W0(),e!==null&&!Sn?(q0(e,t,s),pa(e,t,s)):(Me&&i&&Af(t),t.flags|=1,Tn(e,t,n,s),t.child)}function Qx(e,t,n,i,s,a){return Gr(t),t.updateQueue=null,n=kb(t,i,n,s),Gb(e),i=W0(),e!==null&&!Sn?(q0(e,t,a),pa(e,t,a)):(Me&&i&&Af(t),t.flags|=1,Tn(e,t,n,a),t.child)}function Jx(e,t,n,i,s){if(Gr(t),t.stateNode===null){var a=Jo,r=n.contextType;typeof r=="object"&&r!==null&&(a=kn(r)),a=new n(i,a),t.memoizedState=a.state!==null&&a.state!==void 0?a.state:null,a.updater=Vm,t.stateNode=a,a._reactInternals=t,a=t.stateNode,a.props=i,a.state=t.memoizedState,a.refs={},H0(t),r=n.contextType,a.context=typeof r=="object"&&r!==null?kn(r):Jo,a.state=t.memoizedState,r=n.getDerivedStateFromProps,typeof r=="function"&&(Qp(t,n,r,i),a.state=t.memoizedState),typeof n.getDerivedStateFromProps=="function"||typeof a.getSnapshotBeforeUpdate=="function"||typeof a.UNSAFE_componentWillMount!="function"&&typeof a.componentWillMount!="function"||(r=a.state,typeof a.componentWillMount=="function"&&a.componentWillMount(),typeof a.UNSAFE_componentWillMount=="function"&&a.UNSAFE_componentWillMount(),r!==a.state&&Vm.enqueueReplaceState(a,a.state,null),kc(t,i,a,s),Gc(),a.state=t.memoizedState),typeof a.componentDidMount=="function"&&(t.flags|=4194308),i=!0}else if(e===null){a=t.stateNode;var o=t.memoizedProps,l=qr(n,o);a.props=l;var c=a.context,u=n.contextType;r=Jo,typeof u=="object"&&u!==null&&(r=kn(u));var d=n.getDerivedStateFromProps;u=typeof d=="function"||typeof a.getSnapshotBeforeUpdate=="function",o=t.pendingProps!==o,u||typeof a.UNSAFE_componentWillReceiveProps!="function"&&typeof a.componentWillReceiveProps!="function"||(o||c!==r)&&Wx(t,a,i,r),Wa=!1;var h=t.memoizedState;a.state=h,kc(t,i,a,s),Gc(),c=t.memoizedState,o||h!==c||Wa?(typeof d=="function"&&(Qp(t,n,d,i),c=t.memoizedState),(l=Wa||Xx(t,n,l,i,h,c,r))?(u||typeof a.UNSAFE_componentWillMount!="function"&&typeof a.componentWillMount!="function"||(typeof a.componentWillMount=="function"&&a.componentWillMount(),typeof a.UNSAFE_componentWillMount=="function"&&a.UNSAFE_componentWillMount()),typeof a.componentDidMount=="function"&&(t.flags|=4194308)):(typeof a.componentDidMount=="function"&&(t.flags|=4194308),t.memoizedProps=i,t.memoizedState=c),a.props=i,a.state=c,a.context=r,i=l):(typeof a.componentDidMount=="function"&&(t.flags|=4194308),i=!1)}else{a=t.stateNode,Om(e,t),r=t.memoizedProps,u=qr(n,r),a.props=u,d=t.pendingProps,h=a.context,c=n.contextType,l=Jo,typeof c=="object"&&c!==null&&(l=kn(c)),o=n.getDerivedStateFromProps,(c=typeof o=="function"||typeof a.getSnapshotBeforeUpdate=="function")||typeof a.UNSAFE_componentWillReceiveProps!="function"&&typeof a.componentWillReceiveProps!="function"||(r!==d||h!==l)&&Wx(t,a,i,l),Wa=!1,h=t.memoizedState,a.state=h,kc(t,i,a,s),Gc();var p=t.memoizedState;r!==d||h!==p||Wa||e!==null&&e.dependencies!==null&&Jh(e.dependencies)?(typeof o=="function"&&(Qp(t,n,o,i),p=t.memoizedState),(u=Wa||Xx(t,n,u,i,h,p,l)||e!==null&&e.dependencies!==null&&Jh(e.dependencies))?(c||typeof a.UNSAFE_componentWillUpdate!="function"&&typeof a.componentWillUpdate!="function"||(typeof a.componentWillUpdate=="function"&&a.componentWillUpdate(i,p,l),typeof a.UNSAFE_componentWillUpdate=="function"&&a.UNSAFE_componentWillUpdate(i,p,l)),typeof a.componentDidUpdate=="function"&&(t.flags|=4),typeof a.getSnapshotBeforeUpdate=="function"&&(t.flags|=1024)):(typeof a.componentDidUpdate!="function"||r===e.memoizedProps&&h===e.memoizedState||(t.flags|=4),typeof a.getSnapshotBeforeUpdate!="function"||r===e.memoizedProps&&h===e.memoizedState||(t.flags|=1024),t.memoizedProps=i,t.memoizedState=p),a.props=i,a.state=p,a.context=l,i=u):(typeof a.componentDidUpdate!="function"||r===e.memoizedProps&&h===e.memoizedState||(t.flags|=4),typeof a.getSnapshotBeforeUpdate!="function"||r===e.memoizedProps&&h===e.memoizedState||(t.flags|=1024),i=!1)}return a=i,Vo(e,t),i=(t.flags&128)!==0,a||i?(a=t.stateNode,n=i&&typeof n.getDerivedStateFromError!="function"?null:a.render(),t.flags|=1,e!==null&&i?(t.child=Xr(t,e.child,null,s),t.child=Xr(t,null,n,s)):Tn(e,t,n,s),t.memoizedState=a.state,e=t.child):e=pa(e,t,s),e}function $x(e,t,n,i){return Hr(),t.flags|=256,Tn(e,t,n,i),t.child}var Xm={dehydrated:null,treeContext:null,retryLane:0,hydrationErrors:null};function Wm(e){return{baseLanes:e,cachePool:Ib()}}function qm(e,t,n){return e=e!==null?e.childLanes&~n:0,t&&(e|=Li),e}function wS(e,t,n){var i=t.pendingProps,s=!1,a=(t.flags&128)!==0,r;if((r=a)||(r=e!==null&&e.memoizedState===null?!1:(Wn.current&2)!==0),r&&(s=!0,t.flags&=-129),r=(t.flags&32)!==0,t.flags&=-33,e===null){if(Me){if(s?ir(t):sr(),(e=$e)?(e=AM(e,$i),e=e!==null&&e.data!=="&"?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:cr!==null?{id:zs,overflow:Bs}:null,retryLane:536870912,hydrationErrors:null},n=Nb(e),n.return=t,t.child=n,Bn=t,$e=null)):e=null,e===null)throw ur(t);return mg(e)?t.lanes=32:t.lanes=536870912,null}return a=i.children,i=i.fallback,s?(sr(),s=t.mode,a=Uf({mode:"hidden",children:a},s),i=Pr(i,s,n,null),a.return=t,i.return=t,a.sibling=i,t.child=a,i=t.child,i.memoizedState=Wm(n),i.childLanes=qm(e,r,n),t.memoizedState=Xm,Wc(null,i)):(ir(t),ng(t,a))}var o=e.memoizedState;if(o!==null){var l=o.dehydrated;if(l!==null)return X2(e,t,a,r,i,l,o,n)}return s?(sr(),s=i.fallback,a=t.mode,o=e.child,l=o.sibling,i=la(o,{mode:"hidden",children:i.children}),i.subtreeFlags=o.subtreeFlags&1206910976,l!==null?s=la(l,s):(s=Pr(s,a,n,null),s.flags|=2),s.return=t,i.return=t,i.sibling=s,t.child=i,Wc(null,i),i=t.child,s=e.child.memoizedState,s===null?s=Wm(n):(a=s.cachePool,a!==null?(o=bn._currentValue,a=a.parent!==o?{parent:o,pool:o}:a):a=Ib(),s={baseLanes:s.baseLanes|n,cachePool:a}),i.memoizedState=s,i.childLanes=qm(e,r,n),t.memoizedState=Xm,Wc(e.child,i)):(ir(t),n=e.child,e=n.sibling,n=la(n,{mode:"visible",children:i.children}),n.return=t,n.sibling=null,e!==null&&(r=t.deletions,r===null?(t.deletions=[e],t.flags|=16):r.push(e)),t.child=n,t.memoizedState=null,n)}function ng(e,t){return t=Uf({mode:"visible",children:t},e.mode),t.return=e,e.child=t}function Uf(e,t){return e=bi(22,e,null,t),e.lanes=0,e}function ph(e,t,n){return Xr(t,e.child,null,n),e=ng(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function X2(e,t,n,i,s,a,r,o){if(n)return t.flags&256?(ir(t),t.flags&=-257,ph(e,t,o)):t.memoizedState!==null?(sr(),t.child=e.child,t.flags|=128,null):(sr(),a=s.fallback,r=t.mode,s=Uf({mode:"visible",children:s.children},r),a=Pr(a,r,o,null),a.flags|=2,s.return=t,a.return=t,s.sibling=a,t.child=s,Xr(t,e.child,null,o),s=t.child,s.memoizedState=Wm(o),s.childLanes=qm(e,i,o),t.memoizedState=Xm,Wc(null,s));if(ir(t),mg(a)){if(i=a.nextSibling&&a.nextSibling.dataset,i)var l=i.dgst;return i=l,i!==""&&(s=Error(at(419)),s.stack="",s.digest=i,eu({value:s,source:null,stack:null})),ph(e,t,o)}if(Sn||Vr(e,t,o,!1),i=(o&e.childLanes)!==0,Sn||i){if(hr.current!==null)return ph(e,t,o);if(i=Ke,i!==null&&(s=nb(i,o),s!==0&&s!==r.retryLane))throw r.retryLane=s,Qr(e,s),Si(i,e,s),eg;return v0(a)||pf(),ph(e,t,o)}return v0(a)?(t.flags|=192,t.child=e.child,null):(e=r.treeContext,$e=ts(a.nextSibling),Bn=t,Me=!0,tr=null,$i=!1,e!==null&&Lb(t,e),t=ng(t,s.children),t.flags|=134221824,t)}function t1(e,t,n){e.lanes|=t;var i=e.alternate;i!==null&&(i.lanes|=t),Ch(e.return,t,n)}function e1(e){for(var t=null;e!==null;){var n=e.alternate;n!==null&&ef(n)===null&&(t=e),e=e.sibling}return t}function mh(e,t,n,i,s,a){var r=e.memoizedState;r===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:i,tail:n,tailMode:s,treeForkCount:a}:(r.isBackwards=t,r.rendering=null,r.renderingStartTime=0,r.last=i,r.tail=n,r.tailMode=s,r.treeForkCount=a)}function Jp(e){var t=e.child;for(e.child=null;t!==null;){var n=t.sibling;t.sibling=e.child,e.child=t,t=n}}function Ym(e,t,n){var i=t.pendingProps,s=i.revealOrder,a=i.tail;i=i.children;var r=Wn.current;if(t.flags&128)return iu(t,r),null;var o=(r&2)!==0;if(o?(r=r&1|2,t.flags|=128):r&=1,iu(t,r),s==="backwards"&&e!==null?(Jp(e),Tn(e,t,i,n),Jp(e)):Tn(e,t,i,n),i=Me?tu:0,!o&&e!==null&&(e.flags&128)!==0)t:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&t1(e,n,t);else if(e.tag===19)t1(e,n,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break t;for(;e.sibling===null;){if(e.return===null||e.return===t)break t;e=e.return}e.sibling.return=e.return,e=e.sibling}switch(s){case"backwards":n=e1(t.child),n===null?(s=t.child,t.child=null):(s=n.sibling,n.sibling=null,Jp(t)),mh(t,!0,s,null,a,i);break;case"unstable_legacy-backwards":for(n=null,s=t.child,t.child=null;s!==null;){if(e=s.alternate,e!==null&&ef(e)===null){t.child=s;break}e=s.sibling,s.sibling=n,n=s,s=e}mh(t,!0,n,null,a,i);break;case"together":mh(t,!1,null,null,void 0,i);break;case"independent":t.memoizedState=null;break;default:n=e1(t.child),n===null?(s=t.child,t.child=null):(s=n.sibling,n.sibling=null),mh(t,!1,s,n,a,i)}return t.child}function n1(e,t,n){var i=t.pendingProps;return Ka(t,t.type,i.value),Tn(e,t,i.children,n),t.child}function pa(e,t,n){if(e!==null&&(t.dependencies=e.dependencies),dr|=t.lanes,(n&t.childLanes)===0)if(e!==null){if(Vr(e,t,n,!1),(n&t.childLanes)===0)return null}else return null;if(e!==null&&t.child!==e.child)throw Error(at(153));if(t.child!==null){for(e=t.child,n=la(e,e.pendingProps),t.child=n,n.return=t;e.sibling!==null;)e=e.sibling,n=n.sibling=la(e,e.pendingProps),n.return=t;n.sibling=null}return t.child}function ig(e,t){return(e.lanes&t)!==0?!0:(e=e.dependencies,!!(e!==null&&Jh(e)))}function W2(e,t,n){switch(t.tag){case 3:Xh(t,t.stateNode.containerInfo),Ka(t,bn,e.memoizedState.cache),Hr();break;case 27:case 5:xm(t);break;case 4:Xh(t,t.stateNode.containerInfo);break;case 10:Ka(t,t.type,t.memoizedProps.value);break;case 31:if(t.memoizedState!==null)return t.flags|=128,zm(t),null;break;case 13:var i=t.memoizedState;if(i!==null){if(i.dehydrated!==null)return ir(t),t.flags|=128,null;i=Vr(e,t,n,!1);var s=t.child.childLanes;return i||(n&s)!==0?wS(e,t,n):(ir(t),e=pa(e,t,n),e!==null?e.sibling:null)}ir(t);break;case 19:if(t.flags&128)return Ym(e,t,n);if(s=(e.flags&128)!==0,i=(n&t.childLanes)!==0,i||(Vr(e,t,n,!1),i=(n&t.childLanes)!==0),s){if(i)return Ym(e,t,n);t.flags|=128}if(s=t.memoizedState,s!==null&&(s.rendering=null,s.tail=null,s.lastEffect=null),iu(t,Wn.current),i)break;return null;case 22:return t.lanes=0,AS(e,t,n,t.pendingProps);case 24:Ka(t,bn,e.memoizedState.cache)}return pa(e,t,n)}function RS(e,t,n){if(e!==null)if(e.memoizedProps!==t.pendingProps)Sn=!0;else{if(!ig(e,n)&&(t.flags&128)===0)return Sn=!1,W2(e,t,n);Sn=(e.flags&131072)!==0}else Sn=!1,Me&&(t.flags&1048576)!==0&&Ub(t,tu,t.index);switch(t.lanes=0,t.tag){case 16:t:{var i=t.pendingProps;if(e=Nr(t.elementType),t.type=e,typeof e=="function")I0(e)?(i=qr(e,i),t.tag=1,t=Jx(null,t,e,i,n)):(t.tag=0,t=km(null,t,e,i,n));else{if(e!=null){var s=e.$$typeof;if(s===S0){t.tag=11,t=Yx(null,t,e,i,n);break t}else if(s===M0){t.tag=14,t=Zx(null,t,e,i,n);break t}else if(s===Is){t.tag=10,t.type=e,t=n1(null,t,n);break t}}throw t=ym(e)||e,Error(at(306,t,""))}}return t;case 0:return km(e,t,t.type,t.pendingProps,n);case 1:return i=t.type,s=qr(i,t.pendingProps),Jx(e,t,i,s,n);case 3:t:{if(Xh(t,t.stateNode.containerInfo),e===null)throw Error(at(387));i=t.pendingProps;var a=t.memoizedState;s=a.element,Om(e,t),kc(t,i,null,n);var r=t.memoizedState;if(i=r.cache,Ka(t,bn,i),i!==a.cache&&Um(t,[bn],n,!0),Gc(),i=r.element,a.isDehydrated)if(a={element:i,isDehydrated:!1,cache:r.cache},t.updateQueue.baseState=a,t.memoizedState=a,t.flags&256){t=$x(e,t,i,n);break t}else if(i!==s){s=Ji(Error(at(424)),t),eu(s),t=$x(e,t,i,n);break t}else for(e=t.stateNode.containerInfo,e.nodeType===9?e=e.body:e=e.nodeName==="HTML"?e.ownerDocument.body:e,$e=ts(e.firstChild),Bn=t,Me=!0,tr=null,$i=!0,n=Bb(t,null,i,n),t.child=n;n;)n.flags=n.flags&-3|134221824,n=n.sibling;else{if(Hr(),i===s){t=pa(e,t,n);break t}Tn(e,t,i,n)}t=t.child}return t;case 26:return Vo(e,t),e===null?(n=C1(t.type,null,t.pendingProps,null))?t.memoizedState=n:Me||(t.stateNode=vM(t.type,t.pendingProps,$a.current,t)):t.memoizedState=C1(t.type,e.memoizedProps,t.pendingProps,e.memoizedState),null;case 27:return xm(t),e===null&&Me&&(i=t.stateNode=wM(t.type,t.pendingProps,$a.current),Bn=t,$i=!0,s=$e,mr(t.type)?(y0=s,$e=ts(i.firstChild)):$e=s),Tn(e,t,t.pendingProps.children,n),Vo(e,t),e===null&&(t.flags|=4194304),t.child;case 5:return e===null&&Me&&((s=i=$e)&&(i=zR(i,t.type,t.pendingProps,$i),i!==null?(t.stateNode=i,Bn=t,$e=ts(i.firstChild),$i=!1,s=!0):s=!1),s||ur(t)),xm(t),s=t.type,a=t.pendingProps,r=e!==null?e.memoizedProps:null,i=a.children,p0(s,a)?i=null:r!==null&&p0(s,r)&&(t.flags|=32),t.memoizedState!==null&&(s=X0(e,t,O2,null,null,n),Sl._currentValue=s),Vo(e,t),Tn(e,t,i,n),t.child;case 6:return e===null&&Me&&((e=n=$e)&&(n=BR(n,t.pendingProps,$i),n!==null?(t.stateNode=n,Bn=t,$e=null,e=!0):e=!1),e||ur(t)),null;case 13:return wS(e,t,n);case 4:return Xh(t,t.stateNode.containerInfo),i=t.pendingProps,e===null?t.child=Xr(t,null,i,n):Tn(e,t,i,n),t.child;case 11:return Yx(e,t,t.type,t.pendingProps,n);case 7:return i=t.pendingProps,Vo(e,t),Tn(e,t,i,n),t.child;case 8:return Tn(e,t,t.pendingProps.children,n),t.child;case 12:return Tn(e,t,t.pendingProps.children,n),t.child;case 10:return n1(e,t,n);case 9:return s=t.type._context,i=t.pendingProps.children,Gr(t),s=kn(s),i=i(s),t.flags|=1,Tn(e,t,i,n),t.child;case 14:return Zx(e,t,t.type,t.pendingProps,n);case 15:return TS(e,t,t.type,t.pendingProps,n);case 19:return Ym(e,t,n);case 31:return k2(e,t,n);case 22:return AS(e,t,n,t.pendingProps);case 24:return Gr(t),i=kn(bn),e===null?(s=B0(),s===null&&(s=Ke,a=z0(),s.pooledCache=a,a.refCount++,a!==null&&(s.pooledCacheLanes|=n),s=a),t.memoizedState={parent:i,cache:s},H0(t),Ka(t,bn,s)):((e.lanes&n)!==0&&(Om(e,t),kc(t,null,null,n),Gc()),s=e.memoizedState,a=t.memoizedState,s.parent!==i?(s={parent:i,cache:i},t.memoizedState=s,t.lanes===0&&(t.memoizedState=t.updateQueue.baseState=s),Ka(t,bn,i)):(i=a.cache,Ka(t,bn,i),i!==s.cache&&Um(t,[bn],n,!0))),Tn(e,t,t.pendingProps.children,n),t.child;case 30:return t.stateNode===null&&(t.stateNode={autoName:null,paired:null,clones:null,ref:null}),i=t.pendingProps,i.name!=null&&i.name!=="auto"?t.flags|=e===null?18882560:18874368:Me&&Af(t),e!==null&&e.memoizedProps.name!==i.name?t.flags|=4194816:Vo(e,t),Tn(e,t,i.children,n),t.child;case 29:throw t.pendingProps}throw Error(at(156,t.tag))}function aa(e){e.flags|=4}function $p(e,t,n,i,s){var a;if((a=(e.mode&32)!==0)&&(a=n===null?U1(t,i):U1(t,i)&&(i.src!==n.src||i.srcSet!==n.srcSet)),a){if(e.flags|=16777216,(s&335544128)===s)if(e.stateNode.complete)e.flags|=8192;else if(iM())e.flags|=8192;else throw Br=$h,F0}else e.flags&=-16777217}function i1(e,t){if(t.type!=="stylesheet"||(t.state.loading&4)!==0)e.flags&=-16777217;else if(e.flags|=16777216,!NM(t))if(iM())e.flags|=8192;else throw Br=$h,F0}function gh(e,t){t!==null&&(e.flags|=4),e.flags&16384&&(t=e.tag!==22?$1():536870912,e.lanes|=t,gl|=t)}function Rc(e,t){if(!Me)switch(e.tailMode){case"visible":break;case"collapsed":for(var n=e.tail,i=null;n!==null;)n.alternate!==null&&(i=n),n=n.sibling;i===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:i.sibling=null;break;default:for(t=e.tail,n=null;t!==null;)t.alternate!==null&&(n=t),t=t.sibling;n===null?e.tail=null:n.sibling=null}}function Je(e){var t=e.alternate!==null&&e.alternate.child===e.child,n=0,i=0;if(t)for(var s=e.child;s!==null;)n|=s.lanes|s.childLanes,i|=s.subtreeFlags&1206910976,i|=s.flags&1206910976,s.return=e,s=s.sibling;else for(s=e.child;s!==null;)n|=s.lanes|s.childLanes,i|=s.subtreeFlags,i|=s.flags,s.return=e,s=s.sibling;return e.subtreeFlags|=i,e.childLanes=n,t}function q2(e,t,n){var i=t.pendingProps;switch(P0(t),t.tag){case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return Je(t),null;case 1:return Je(t),null;case 3:return n=t.stateNode,i=null,e!==null&&(i=e.memoizedState.cache),t.memoizedState.cache!==i&&(t.flags|=2048),ca(bn),fl(),n.pendingContext&&(n.context=n.pendingContext,n.pendingContext=null),(e===null||e.child===null)&&(Fo(t)?aa(t):e===null||e.memoizedState.isDehydrated&&(t.flags&256)===0||(t.flags|=1024,Zp())),Je(t),null;case 26:var s=t.type,a=t.memoizedState;return e===null?(aa(t),a!==null?(Je(t),i1(t,a)):(Je(t),$p(t,s,null,i,n))):a?a!==e.memoizedState?(aa(t),Je(t),i1(t,a)):(Je(t),t.flags&=-16777217):(e=e.memoizedProps,e!==i&&aa(t),Je(t),$p(t,s,e,i,n)),null;case 27:if(Wh(t),n=$a.current,s=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==i&&aa(t);else{if(!i){if(t.stateNode===null)throw Error(at(166));return Je(t),t.subtreeFlags&=-33554433,null}e=Fs.current,Fo(t)?Dx(t,e):(e=wM(s,i,n),t.stateNode=e,aa(t))}return Je(t),t.subtreeFlags&=-33554433,null;case 5:if(Wh(t),s=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==i&&aa(t);else{if(!i){if(t.stateNode===null)throw Error(at(166));return Je(t),t.subtreeFlags&=-33554433,null}if(a=Fs.current,Fo(t))Dx(t,a);else{var r=ou($a.current);switch(a){case 1:a=r.createElementNS("http://www.w3.org/2000/svg",s);break;case 2:a=r.createElementNS("http://www.w3.org/1998/Math/MathML",s);break;default:switch(s){case"svg":a=r.createElementNS("http://www.w3.org/2000/svg",s);break;case"math":a=r.createElementNS("http://www.w3.org/1998/Math/MathML",s);break;case"script":a=r.createElement("div"),a.innerHTML="<script><\/script>",a=a.removeChild(a.firstChild);break;case"select":a=typeof i.is=="string"?r.createElement("select",{is:i.is}):r.createElement("select"),i.multiple?a.multiple=!0:i.size&&(a.size=i.size);break;default:a=typeof i.is=="string"?r.createElement(s,{is:i.is}):r.createElement(s)}}a[Gn]=t,a[Ei]=i;t:for(r=t.child;r!==null;){if(r.tag===5||r.tag===6)a.appendChild(r.stateNode);else if(r.tag!==4&&r.tag!==27&&r.child!==null){r.child.return=r,r=r.child;continue}if(r===t)break t;for(;r.sibling===null;){if(r.return===null||r.return===t)break t;r=r.return}r.sibling.return=r.return,r=r.sibling}t.stateNode=a;t:switch(qn(a,s,i),s){case"button":case"input":case"select":case"textarea":i=!!i.autoFocus;break t;case"img":i=!0;break t;default:i=!1}i&&aa(t)}}return Je(t),t.subtreeFlags&=-33554433,$p(t,t.type,e===null?null:e.memoizedProps,t.pendingProps,n),null;case 6:if(e&&t.stateNode!=null)e.memoizedProps!==i&&aa(t);else{if(typeof i!="string"&&t.stateNode===null)throw Error(at(166));if(e=$a.current,Fo(t)){if(e=t.stateNode,n=t.memoizedProps,i=null,s=Bn,s!==null)switch(s.tag){case 27:case 5:i=s.memoizedProps}e[Gn]=t,e=!!(e.nodeValue===n||i!==null&&i.suppressHydrationWarning===!0||mM(e.nodeValue,n)),e||ur(t,!0)}else e=ou(e).createTextNode(i),e[Gn]=t,t.stateNode=e}return Je(t),null;case 31:if(n=t.memoizedState,e===null||e.memoizedState!==null){if(i=Fo(t),n!==null){if(e===null){if(!i)throw Error(at(318));if(e=t.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(at(557));e[Gn]=t}else Hr(),(t.flags&128)===0&&(t.memoizedState=null),t.flags|=4;Je(t),e=!1}else n=Zp(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=n),e=!0;if(!e)return t.flags&256?(Ni(t),t):(Ni(t),null);if((t.flags&128)!==0)throw Error(at(558))}return Je(t),null;case 13:if(i=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(s=Fo(t),i!==null&&i.dehydrated!==null){if(e===null){if(!s)throw Error(at(318));if(s=t.memoizedState,s=s!==null?s.dehydrated:null,!s)throw Error(at(317));s[Gn]=t}else Hr(),(t.flags&128)===0&&(t.memoizedState=null),t.flags|=4;Je(t),s=!1}else s=Zp(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=s),s=!0;if(!s)return t.flags&256?(Ni(t),t):(Ni(t),null)}return Ni(t),(t.flags&128)!==0?(t.lanes=n,t):(n=i!==null,e=e!==null&&e.memoizedState!==null,n&&(i=t.child,s=null,i.alternate!==null&&i.alternate.memoizedState!==null&&i.alternate.memoizedState.cachePool!==null&&(s=i.alternate.memoizedState.cachePool.pool),a=null,i.memoizedState!==null&&i.memoizedState.cachePool!==null&&(a=i.memoizedState.cachePool.pool),a!==s&&(i.flags|=2048)),n!==e&&n&&(t.child.flags|=8192),gh(t,t.updateQueue),Je(t),null);case 4:return fl(),e===null&&fg(t.stateNode.containerInfo),t.flags|=67108864,Je(t),null;case 10:return ca(t.type),Je(t),null;case 19:if(G0(t),i=t.memoizedState,i===null)return Je(t),null;if(s=(t.flags&128)!==0,a=i.rendering,a===null)if(s)Rc(i,!1);else{if(dn!==0||e!==null&&(e.flags&128)!==0)for(e=t.child;e!==null;){if(a=ef(e),a!==null){for(t.flags|=128,Rc(i,!1),e=a.updateQueue,t.updateQueue=e,gh(t,e),t.subtreeFlags=0,e=n,n=t.child;n!==null;)Db(n,e),n=n.sibling;return iu(t,Wn.current&1|2),Me&&ra(t,i.treeForkCount),t.child}e=e.sibling}i.tail!==null&&Oi()>ff&&(t.flags|=128,s=!0,Rc(i,!1),t.lanes=4194304)}else{if(!s)if(e=ef(a),e!==null){if(t.flags|=128,s=!0,e=e.updateQueue,t.updateQueue=e,gh(t,e),Rc(i,!0),i.tail===null&&i.tailMode!=="collapsed"&&i.tailMode!=="visible"&&!a.alternate&&!Me)return Je(t),null}else 2*Oi()-i.renderingStartTime>ff&&n!==536870912&&(t.flags|=128,s=!0,Rc(i,!1),t.lanes=4194304);i.isBackwards?(a.sibling=t.child,t.child=a):(e=i.last,e!==null?e.sibling=a:t.child=a,i.last=a)}if(i.tail!==null){e=i.tail;t:{for(n=e;n!==null;){if(n.alternate!==null){n=!1;break t}n=n.sibling}n=!0}return i.rendering=e,i.tail=e.sibling,i.renderingStartTime=Oi(),e.sibling=null,a=Wn.current,a=s?a&1|2:a&1,i.tailMode==="visible"||i.tailMode==="collapsed"||!n||Me?iu(t,a):(n=a,tn(Yn,t),tn(Wn,n),$n===null&&($n=t)),Me&&ra(t,i.treeForkCount),e}return Je(t),null;case 22:case 23:return Ni(t),V0(),i=t.memoizedState!==null,e!==null?e.memoizedState!==null!==i&&(t.flags|=8192):i&&(t.flags|=8192),i?(n&536870912)!==0&&(t.flags&128)===0&&(Je(t),t.subtreeFlags&6&&(t.flags|=8192)):Je(t),n=t.updateQueue,n!==null&&gh(t,n.retryQueue),n=null,e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(n=e.memoizedState.cachePool.pool),i=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(i=t.memoizedState.cachePool.pool),i!==n&&(t.flags|=2048),e!==null&&Xn(zr),null;case 24:return n=null,e!==null&&(n=e.memoizedState.cache),t.memoizedState.cache!==n&&(t.flags|=2048),ca(bn),Je(t),null;case 25:return null;case 30:return t.flags|=33554432,Je(t),null}throw Error(at(156,t.tag))}function Y2(e,t){switch(P0(t),t.tag){case 1:return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return ca(bn),fl(),e=t.flags,(e&65536)!==0&&(e&128)===0?(t.flags=e&-65537|128,t):null;case 26:case 27:case 5:return Wh(t),null;case 31:if(t.memoizedState!==null){if(Ni(t),t.alternate===null)throw Error(at(340));Hr()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 13:if(Ni(t),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(at(340));Hr()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return G0(t),e=t.flags,e&65536?(t.flags=e&-65537|128,e=t.memoizedState,e!==null&&(e.rendering=null,e.tail=null),t.flags|=4,t):null;case 4:return fl(),null;case 10:return ca(t.type),null;case 22:case 23:return Ni(t),V0(),e!==null&&Xn(zr),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 24:return ca(bn),null;case 25:return null;default:return null}}function CS(e,t){switch(P0(t),t.tag){case 3:ca(bn),fl();break;case 26:case 27:case 5:Wh(t);break;case 4:fl();break;case 31:t.memoizedState!==null&&Ni(t);break;case 13:Ni(t);break;case 19:G0(t);break;case 10:ca(t.type);break;case 22:case 23:Ni(t),V0(),e!==null&&Xn(zr);break;case 24:ca(bn)}}function xu(e,t){try{var n=t.updateQueue,i=n!==null?n.lastEffect:null;if(i!==null){var s=i.next;n=s;do{if((n.tag&e)===e){i=void 0;var a=n.create,r=n.inst;i=a(),r.destroy=i}n=n.next}while(n!==s)}}catch(o){Ge(t,t.return,o)}}function fr(e,t,n){try{var i=t.updateQueue,s=i!==null?i.lastEffect:null;if(s!==null){var a=s.next;i=a;do{if((i.tag&e)===e){var r=i.inst,o=r.destroy;if(o!==void 0){r.destroy=void 0,s=t;var l=n,c=o;try{c()}catch(u){Ge(s,l,u)}}}i=i.next}while(i!==a)}}catch(u){Ge(t,t.return,u)}}function DS(e){var t=e.updateQueue;if(t!==null){var n=e.stateNode;try{Hb(t,n)}catch(i){Ge(e,e.return,i)}}}function NS(e,t,n){n.props=qr(e.type,e.memoizedProps),n.state=e.memoizedState;try{n.componentWillUnmount()}catch(i){Ge(e,t,i)}}function Ls(e,t){try{var n=e.ref;if(n!==null){switch(e.tag){case 26:case 27:case 5:var i=e.stateNode;break;case 30:var s=e.stateNode,a=ha(e.memoizedProps,s);(s.ref===null||s.ref.name!==a)&&(s.ref=bM(a)),i=s.ref;break;case 7:if(e.stateNode===null){var r=new Fi(e);Mi(e.child,!1,IR,r,void 0,void 0),e.stateNode=r}i=e.stateNode;break;default:i=e.stateNode}typeof n=="function"?e.refCleanup=n(i):n.current=i}}catch(o){Ge(e,t,o)}}function Vn(e,t){var n=e.ref,i=e.refCleanup;if(n!==null)if(typeof i=="function")try{i()}catch(s){Ge(e,t,s)}finally{e.refCleanup=null,e=e.alternate,e!=null&&(e.refCleanup=null)}else if(typeof n=="function")try{n(null)}catch(s){Ge(e,t,s)}else n.current=null}function of(e,t){if((e.tag===5||e.tag===27||e.tag===6)&&e.alternate===null&&t!==null)for(var n=0;n<t.length;n++)TM(e.stateNode,t[n])}function s1(e){for(var t=e.return;t!==null&&(ag(t)&&TM(e.stateNode,t.stateNode),!sg(t));)t=t.return}function qc(e){for(var t=e.return;t!==null&&(ag(t)&&PR(e.stateNode,t.stateNode),!sg(t));)t=t.return}function sg(e){return e.tag===5||e.tag===3||e.tag===27}function ag(e){return e&&e.tag===7&&e.stateNode!==null}function Zm(e){var t=e.type,n=e.memoizedProps,i=e.stateNode;try{t:switch(t){case"button":case"input":case"select":case"textarea":n.autoFocus&&i.focus();break t;case"img":n.src?i.src=n.src:n.srcSet&&(i.srcset=n.srcSet)}}catch(s){Ge(e,e.return,s)}}function tm(e,t,n){try{var i=e.stateNode;vR(i,e.type,n,t),i[Ei]=t}catch(s){Ge(e,e.return,s)}}function US(e){return e.tag===5||e.tag===3||e.tag===26||e.tag===27&&mr(e.type)||e.tag===4}function em(e){t:for(;;){for(;e.sibling===null;){if(e.return===null||US(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.tag===27&&mr(e.type)||e.flags&2||e.child===null||e.tag===4)continue t;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function Km(e,t,n,i){var s=e.tag;if(s===5||s===6)s=e.stateNode,t?(n.nodeType===9?n.body:n.nodeName==="HTML"?n.ownerDocument.body:n).insertBefore(s,t):(t=n.nodeType===9?n.body:n.nodeName==="HTML"?n.ownerDocument.body:n,t.appendChild(s),n=n._reactRootContainer,n!=null||t.onclick!==null||(t.onclick=Ps)),of(e,i),Ne=!0;else if(s!==4&&(s===27&&(of(e,i),i=null,mr(e.type)&&(n=e.stateNode,t=null)),e=e.child,e!==null))for(Km(e,t,n,i),e=e.sibling;e!==null;)Km(e,t,n,i),e=e.sibling}function lf(e,t,n,i){var s=e.tag;if(s===5||s===6)s=e.stateNode,t?n.insertBefore(s,t):n.appendChild(s),of(e,i),Ne=!0;else if(s!==4&&(s===27&&(of(e,i),i=null,mr(e.type)&&(n=e.stateNode)),e=e.child,e!==null))for(lf(e,t,n,i),e=e.sibling;e!==null;)lf(e,t,n,i),e=e.sibling}function LS(e){var t=e.stateNode,n=e.memoizedProps;try{for(var i=e.type,s=t.attributes;s.length;)t.removeAttributeNode(s[0]);qn(t,i,n),t[Gn]=e,t[Ei]=n}catch(a){Ge(e,e.return,a)}}var cf=!1,Ui=null;function a1(e){(e.tag===30||(e.subtreeFlags&33554432)!==0)&&(cf=!0)}var Os=null;function r1(){var e=Os;return Os=null,e}var xi=0;function Rl(e,t,n,i,s){return xi=0,OS(e.child,t,n,i,s)}function OS(e,t,n,i,s){for(var a=!1;e!==null;){if(e.tag===5){var r=e.stateNode;if(i!==null){var o=m0(r);i.push(o),o.view&&(a=!0)}else a||m0(r).view&&(a=!0);cf=!0,yM(r,xi===0?t:t+"_"+xi,n),xi++}else(e.tag!==22||e.memoizedState===null)&&(e.tag===30&&s||OS(e.child,t,n,i,s)&&(a=!0));e=e.sibling}return a}function Vs(e,t){for(;e!==null;)e.tag===5?_M(e.stateNode,e.memoizedProps):(e.tag!==22||e.memoizedState===null)&&(e.tag===30&&t||Vs(e.child,t)),e=e.sibling}function Oh(e){if((e.subtreeFlags&18874368)!==0)for(e=e.child;e!==null;){if((e.tag!==22||e.memoizedState===null)&&(Oh(e),e.tag===30&&(e.flags&18874368)!==0&&e.stateNode.paired)){var t=e.memoizedProps;if(t.name==null||t.name==="auto")throw Error(at(544));var n=t.name;t=va(t.default,t.share),t!=="none"&&(Rl(e,n,t,null,!1)||Vs(e.child,!1))}e=e.sibling}}function jm(e,t){if(e.tag===30){var n=e.stateNode,i=e.memoizedProps,s=ha(i,n),a=va(i.default,n.paired?i.share:i.enter);a!=="none"?Rl(e,s,a,null,!1)?(Oh(e),n.paired||t||vl(e,i.onEnter)):Vs(e.child,!1):Oh(e)}else if((e.subtreeFlags&33554432)!==0)for(e=e.child;e!==null;)jm(e,t),e=e.sibling;else Oh(e)}function Qm(e){if(Ui!==null&&Ui.size!==0){var t=Ui;if((e.subtreeFlags&18874368)!==0)for(e=e.child;e!==null;){if(e.tag!==22||e.memoizedState===null){if(e.tag===30&&(e.flags&18874368)!==0){var n=e.memoizedProps,i=n.name;if(i!=null&&i!=="auto"){var s=t.get(i);if(s!==void 0){var a=va(n.default,n.share);if(a!=="none"&&(Rl(e,i,a,null,!1)?(a=e.stateNode,s.paired=a,a.paired=s,vl(e,n.onShare)):Vs(e.child,!1)),t.delete(i),t.size===0)break}}}Qm(e)}e=e.sibling}}}function Jm(e){if(e.tag===30){var t=e.memoizedProps,n=ha(t,e.stateNode),i=Ui!==null?Ui.get(n):void 0,s=va(t.default,i!==void 0?t.share:t.exit);s!=="none"&&(Rl(e,n,s,null,!1)?i!==void 0?(s=e.stateNode,i.paired=s,s.paired=i,Ui.delete(n),vl(e,t.onShare)):vl(e,t.onExit):Vs(e.child,!1)),Ui!==null&&Qm(e)}else if((e.subtreeFlags&33554432)!==0)for(e=e.child;e!==null;)Jm(e),e=e.sibling;else Ui!==null&&Qm(e)}function IS(e){for(e=e.child;e!==null;){if(e.tag===30){var t=e.memoizedProps,n=ha(t,e.stateNode);t=va(t.default,t.update),e.flags&=-5,t!=="none"&&Rl(e,n,t,e.memoizedState=[],!1)}else(e.subtreeFlags&33554432)!==0&&IS(e);e=e.sibling}}function $m(e){if((e.subtreeFlags&18874368)!==0)for(e=e.child;e!==null;){if(e.tag!==22||e.memoizedState===null){if(e.tag===30&&(e.flags&18874368)!==0){var t=e.stateNode;t.paired!==null&&(t.paired=null,Vs(e.child,!1))}$m(e)}e=e.sibling}}function Ih(e){if(e.tag===30)e.stateNode.paired=null,Vs(e.child,!1),$m(e);else if((e.subtreeFlags&33554432)!==0)for(e=e.child;e!==null;)Ih(e),e=e.sibling;else $m(e)}function PS(e){for(e=e.child;e!==null;)e.tag===30?Vs(e.child,!1):(e.subtreeFlags&33554432)!==0&&PS(e),e=e.sibling}function rg(e,t,n,i,s,a,r){for(var o=!1;t!==null;){if(t.tag===5){var l=t.stateNode;if(a!==null&&xi<a.length){var c=a[xi],u=m0(l);(c.view||u.view)&&(o=!0);var d;if(d=(e.flags&4)===0)if(u.clip)d=!0;else{d=c.rect;var h=u.rect;d=d.y!==h.y||d.x!==h.x||d.height!==h.height||d.width!==h.width}d&&(e.flags|=4),u.abs?u=!c.abs:(c=c.rect,u=u.rect,u=c.height!==u.height||c.width!==u.width),u&&(e.flags|=32)}else e.flags|=32;(e.flags&4)!==0&&yM(l,xi===0?n:n+"_"+xi,s),o&&(e.flags&4)!==0||(Os===null&&(Os=[]),Os.push(l,xi===0?i:i+"_"+xi,t.memoizedProps)),xi++}else(t.tag!==22||t.memoizedState===null)&&(t.tag===30&&r?e.flags|=t.flags&32:rg(e,t.child,n,i,s,a,r)&&(o=!0));t=t.sibling}return o}function zS(e,t){for(e=e.child;e!==null;){if(e.tag===30){var n=e.memoizedProps,i=e.stateNode,s=ha(n,i),a=va(n.default,n.update);if(t){i=i.clones;var r=i===null?null:i.map(MR)}else r=e.memoizedState,e.memoizedState=null;i=e;var o=e.child;xi=0,s=rg(i,o,s,s,a,r,!1),(e.flags&4)!==0&&s&&(t||vl(e,n.onUpdate))}else(e.subtreeFlags&33554432)!==0&&zS(e,t);e=e.sibling}}var In=!1,Pe=!1,Ds=!1,nm=!1,o1=typeof WeakSet=="function"?WeakSet:Set,Pn=null,Ns=!1,Pc=!1,uf=!1,t0=!1;function Z2(e,t,n){if(e=e.containerInfo,f0=Ml,e=Sb(e),U0(e)){if("selectionStart"in e)var i={start:e.selectionStart,end:e.selectionEnd};else t:{i=(i=e.ownerDocument)&&i.defaultView||window;var s=i.getSelection&&i.getSelection();if(s&&s.rangeCount!==0){i=s.anchorNode;var a=s.anchorOffset,r=s.focusNode;s=s.focusOffset;try{i.nodeType,r.nodeType}catch{i=null;break t}var o=0,l=-1,c=-1,u=0,d=0,h=e,p=null;e:for(;;){for(var g;h!==i||a!==0&&h.nodeType!==3||(l=o+a),h!==r||s!==0&&h.nodeType!==3||(c=o+s),h.nodeType===3&&(o+=h.nodeValue.length),(g=h.firstChild)!==null;)p=h,h=g;for(;;){if(h===e)break e;if(p===i&&++u===a&&(l=o),p===r&&++d===s&&(c=o),(g=h.nextSibling)!==null)break;h=p,p=h.parentNode}h=g}i=l===-1||c===-1?null:{start:l,end:c}}else i=null}i=i||{start:0,end:0}}else i=null;for(d0={focusedElem:e,selectionRange:i},Ml=!1,n=(n&335544064)===n,Pn=t,t=n?9270:1024;Pn!==null;){if(e=Pn,n&&(i=e.deletions,i!==null))for(a=0;a<i.length;a++)n&&Jm(i[a]);if(e.alternate===null&&(e.flags&2)!==0)n&&a1(e),vh(n);else{if(e.tag===22){if(i=e.alternate,e.memoizedState!==null){i!==null&&i.memoizedState===null&&n&&Jm(i),vh(n);continue}else if(i!==null&&i.memoizedState!==null){n&&a1(e),vh(n);continue}}i=e.child,(e.subtreeFlags&t)!==0&&i!==null?(i.return=e,Pn=i):(n&&IS(e),vh(n))}}Ui=null}function vh(e){for(;Pn!==null;){var t=Pn,n=e,i=t.alternate,s=t.flags;switch(t.tag){case 0:case 11:case 15:break;case 1:if((s&1024)!==0&&i!==null){n=void 0,s=i.memoizedProps,i=i.memoizedState;var a=t.stateNode;try{var r=qr(t.type,s);n=a.getSnapshotBeforeUpdate(r,i),a.__reactInternalSnapshotBeforeUpdate=n}catch(o){Ge(t,t.return,o)}}break;case 3:if((s&1024)!==0){if(i=t.stateNode.containerInfo,n=i.nodeType,n===9)g0(i);else if(n===1)switch(i.nodeName){case"HEAD":case"HTML":case"BODY":g0(i);break;default:i.textContent=""}}break;case 5:case 26:case 27:case 6:case 4:case 17:break;case 30:n&&i!==null&&(n=ha(i.memoizedProps,i.stateNode),s=t.memoizedProps,s=va(s.default,s.update),s!=="none"&&Rl(i,n,s,i.memoizedState=[],!0));break;default:if((s&1024)!==0)throw Error(at(163))}if(i=t.sibling,i!==null){i.return=t.return,Pn=i;break}Pn=t.return}}function BS(e,t,n){var i=n.flags;switch(n.tag){case 0:case 11:case 15:Us(e,n),i&4&&xu(5,n);break;case 1:if(Us(e,n),i&4)if(e=n.stateNode,t===null)try{e.componentDidMount()}catch(r){Ge(n,n.return,r)}else{var s=qr(n.type,t.memoizedProps);t=t.memoizedState;try{e.componentDidUpdate(s,t,e.__reactInternalSnapshotBeforeUpdate)}catch(r){Ge(n,n.return,r)}}i&64&&DS(n),i&512&&Ls(n,n.return);break;case 3:if(Us(e,n),i&64&&(e=n.updateQueue,e!==null)){if(t=null,n.child!==null)switch(n.child.tag){case 27:case 5:t=n.child.stateNode;break;case 1:t=n.child.stateNode}try{Hb(e,t)}catch(r){Ge(n,n.return,r)}}break;case 27:t===null&&i&4&&LS(n);case 26:case 5:Us(e,n),t===null&&i&4&&Zm(n),i&512&&Ls(n,n.return);break;case 12:Us(e,n);break;case 31:Us(e,n),i&4&&GS(e,n);break;case 13:Us(e,n),i&4&&kS(e,n),i&64&&(e=n.memoizedState,e!==null&&(e=e.dehydrated,e!==null&&(n=rR.bind(null,n),FR(e,n))));break;case 22:if(i=n.memoizedState!==null||In,!i){var a=t!==null&&t.memoizedState!==null||Pe;t=In,s=Pe,In=i,(Pe=a)&&!s?(i=2,(n.subtreeFlags&8772)!==0&&(i|=1),us(e,n,i)):Us(e,n),In=t,Pe=s}break;case 30:Us(e,n),i&512&&Ls(n,n.return);break;case 7:i&512&&Ls(n,n.return);default:Us(e,n)}}function e0(e,t){for(e=e.child;e!==null;)FS(e,t),e=e.sibling}function FS(e,t){switch(e.tag){case 5:case 26:try{var n=e.stateNode;if(t){var i=n.style;typeof i.setProperty=="function"?i.setProperty("display","none","important"):i.display="none"}else{var s=e.stateNode,a=e.memoizedProps.style,r=a!=null&&a.hasOwnProperty("display")?a.display:null;s.style.display=r==null||typeof r=="boolean"?"":(""+r).trim()}}catch(l){Ge(e,e.return,l)}n0(e,t);break;case 6:try{e.stateNode.nodeValue=t?"":e.memoizedProps,Ne=!0}catch(l){Ge(e,e.return,l)}break;case 18:try{var o=e.stateNode;t?M1(o,!0):M1(e.stateNode,!1)}catch(l){Ge(e,e.return,l)}break;case 22:case 23:e.memoizedState===null&&e0(e,t);break;default:e0(e,t)}}function n0(e,t){if(e.subtreeFlags&67108864)for(e=e.child;e!==null;){t:{var n=e,i=t;switch(n.tag){case 4:FS(n,i);break t;case 22:n.memoizedState===null&&n0(n,i);break t;default:n0(n,i)}}e=e.sibling}}function HS(e){var t=e.alternate;t!==null&&(e.alternate=null,HS(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&xf(t)),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}var rn=null,yi=!1;function cs(e,t,n){for(n=n.child;n!==null;)VS(e,t,n),n=n.sibling}function VS(e,t,n){if(Ii&&typeof Ii.onCommitFiberUnmount=="function")try{Ii.onCommitFiberUnmount(du,n)}catch{}switch(n.tag){case 26:Pe||Vn(n,t),cs(e,t,n),n.memoizedState?n.memoizedState.count--:n.stateNode&&!Pe&&(n=n.stateNode,n.parentNode.removeChild(n));break;case 27:Pe||Vn(n,t),qc(n);var i=rn,s=yi;mr(n.type)&&(rn=n.stateNode,yi=!1),cs(e,t,n),RM(n.stateNode,n.type,n.memoizedProps),rn=i,yi=s;break;case 5:Pe||Vn(n,t),qc(n);case 6:if(n.tag===6&&qc(n),i=rn,s=yi,rn=null,cs(e,t,n),rn=i,yi=s,rn!==null)if(yi)try{(rn.nodeType===9?rn.body:rn.nodeName==="HTML"?rn.ownerDocument.body:rn).removeChild(n.stateNode),Ne=!0}catch(a){Ge(n,t,a)}else try{rn.removeChild(n.stateNode),Ne=!0}catch(a){Ge(n,t,a)}break;case 18:rn!==null&&(yi?(e=rn,S1(e.nodeType===9?e.body:e.nodeName==="HTML"?e.ownerDocument.body:e,n.stateNode),El(e)):S1(rn,n.stateNode));break;case 4:i=rn,s=yi,rn=n.stateNode.containerInfo,yi=!0,cs(e,t,n),rn=i,yi=s;break;case 0:case 11:case 14:case 15:fr(2,n,t),Pe||fr(4,n,t),cs(e,t,n);break;case 1:Pe||(Vn(n,t),i=n.stateNode,typeof i.componentWillUnmount=="function"&&NS(n,t,i)),cs(e,t,n);break;case 21:cs(e,t,n);break;case 22:Pe=(i=Pe)||n.memoizedState!==null,cs(e,t,n),Pe=i;break;case 30:Vn(n,t),cs(e,t,n);break;case 7:Pe||Vn(n,t),cs(e,t,n);break;default:cs(e,t,n)}}function GS(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null))){e=e.dehydrated;try{El(e)}catch(n){Ge(t,t.return,n)}}}function kS(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null&&(e=e.dehydrated,e!==null))))try{El(e)}catch(n){Ge(t,t.return,n)}}function K2(e){switch(e.tag){case 31:case 13:case 19:var t=e.stateNode;return t===null&&(t=e.stateNode=new o1),t;case 22:return e=e.stateNode,t=e._retryCache,t===null&&(t=e._retryCache=new o1),t;default:throw Error(at(435,e.tag))}}function yh(e,t){var n=K2(e);t.forEach(function(i){if(!n.has(i)){n.add(i);var s=oR.bind(null,e,i);i.then(s,s)}})}function ci(e,t,n){var i=t.deletions;if(i!==null)for(var s=0;s<i.length;s++){var a=i[s],r=e,o=t,l=o;t:for(;l!==null;){switch(l.tag){case 27:if(mr(l.type)){rn=l.stateNode,yi=!1;break t}break;case 5:rn=l.stateNode,yi=!1;break t;case 3:case 4:rn=l.stateNode.containerInfo,yi=!0;break t}l=l.return}if(rn===null)throw Error(at(160));VS(r,o,a),rn=null,yi=!1,r=a.alternate,r!==null&&(r.return=null),a.return=null}if(t.subtreeFlags&13886)for(t=t.child;t!==null;)XS(t,e,n),t=t.sibling}var hs=null;function XS(e,t,n){var i=e.alternate,s=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:if(s&4&&(i=e.updateQueue,i=i!==null?i.events:null,i!==null))for(var a=0;a<i.length;a++){var r=i[a];r.ref.impl=r.nextImpl}ci(t,e,n),ui(e),s&4&&(fr(3,e,e.return),xu(3,e),fr(5,e,e.return));break;case 1:ci(t,e,n),ui(e),s&512&&(Pe||i===null||Vn(i,i.return)),s&64&&In&&(e=e.updateQueue,e!==null&&(t=e.callbacks,t!==null&&(n=e.shared.hiddenCallbacks,e.shared.hiddenCallbacks=n===null?t:n.concat(t))));break;case 26:if(a=hs,ci(t,e,n),ui(e),s&512&&(Pe||i===null||Vn(i,i.return)),s&4)if(s=i!==null?i.memoizedState:null,n=e.memoizedState,i===null)if(n===null)if(e.stateNode===null)if(In)e.stateNode=vM(e.type,e.memoizedProps,t.containerInfo,e);else{t:{t=e.type,n=e.memoizedProps,s=a.ownerDocument||a;e:switch(t){case"title":i=s.getElementsByTagName("title")[0],(!i||i[gu]||i[Gn]||i.namespaceURI==="http://www.w3.org/2000/svg"||i.hasAttribute("itemprop"))&&(i=s.createElement(t),s.head.insertBefore(i,s.querySelector("head > title"))),qn(i,t,n),i[Gn]=e,zn(i),t=i;break t;case"link":if(a=N1("link","href",s).get(t+(n.href||""))){for(r=0;r<a.length;r++)if(i=a[r],i.getAttribute("href")===(n.href==null||n.href===""?null:n.href)&&i.getAttribute("rel")===(n.rel==null?null:n.rel)&&i.getAttribute("title")===(n.title==null?null:n.title)&&i.getAttribute("crossorigin")===(n.crossOrigin==null?null:n.crossOrigin)){a.splice(r,1);break e}}i=s.createElement(t),qn(i,t,n),s.head.appendChild(i);break;case"meta":if(a=N1("meta","content",s).get(t+(n.content||""))){for(r=0;r<a.length;r++)if(i=a[r],i.getAttribute("content")===(n.content==null?null:""+n.content)&&i.getAttribute("name")===(n.name==null?null:n.name)&&i.getAttribute("property")===(n.property==null?null:n.property)&&i.getAttribute("http-equiv")===(n.httpEquiv==null?null:n.httpEquiv)&&i.getAttribute("charset")===(n.charSet==null?null:n.charSet)){a.splice(r,1);break e}}i=s.createElement(t),qn(i,t,n),s.head.appendChild(i);break;default:throw Error(at(468,t))}i[Gn]=e,zn(i),t=i}e.stateNode=t}else In||_0(a,e.type,e.stateNode);else e.stateNode=D1(a,n,e.memoizedProps);else s!==n?(s===null?(t=i.stateNode,t===null||Pe||t.parentNode.removeChild(t)):s.count--,n===null?In||_0(a,e.type,e.stateNode):D1(a,n,e.memoizedProps)):n===null&&e.stateNode!==null&&tm(e,e.memoizedProps,i.memoizedProps);break;case 27:ci(t,e,n),ui(e),s&512&&(Pe||i===null||Vn(i,i.return)),i!==null&&s&4&&tm(e,e.memoizedProps,i.memoizedProps);break;case 5:if(a=Ds,Ds=!1,ci(t,e,n),Ds=a,ui(e),s&512&&(Pe||i===null||Vn(i,i.return)),e.flags&32){t=e.stateNode;try{pl(t,""),Ne=!0}catch(u){Ge(e,e.return,u)}}s&4&&e.stateNode!=null&&(t=e.memoizedProps,tm(e,t,i!==null?i.memoizedProps:t)),s&1024&&(nm=!0);break;case 6:if(ci(t,e,n),ui(e),s&4){if(e.stateNode===null)throw Error(at(162));t=e.memoizedProps,n=e.stateNode;try{n.nodeValue=t,Ne=!0}catch(u){Ge(e,e.return,u)}}break;case 3:if(Ne=!1,Fh=null,a=hs,hs=lu(t.containerInfo),ci(t,e,n),hs=a,ui(e),s&4&&i!==null&&i.memoizedState.isDehydrated)try{El(t.containerInfo)}catch(u){Ge(e,e.return,u)}nm&&(nm=!1,WS(e)),Ne=!1;break;case 4:s=Ds,Ds=In,i=dx(),a=hs,hs=lu(e.stateNode.containerInfo),ci(t,e,n),ui(e),hs=a,Ne&&Pc&&(uf=!0),Ne=i,Ds=s;break;case 12:ci(t,e,n),ui(e);break;case 31:ci(t,e,n),ui(e),s&4&&(t=e.updateQueue,t!==null&&(e.updateQueue=null,yh(e,t)));break;case 13:ci(t,e,n),ui(e),e.child.flags&8192&&e.memoizedState!==null!=(i!==null&&i.memoizedState!==null)&&(Lf=Oi()),s&4&&(t=e.updateQueue,t!==null&&(e.updateQueue=null,yh(e,t)));break;case 22:a=e.memoizedState!==null,r=i!==null&&i.memoizedState!==null;var o=In,l=Pe,c=Ds;In=o||a,Ds=c||a,Pe=l||r,ci(t,e,n),Pe=l,Ds=c,In=o,ui(e),s&8192&&(t=e.stateNode,t._visibility=a?t._visibility&-2:t._visibility|1,!a||i===null||r||In||Pe||(t=r||Pe,n=In,i=Pe,In=a||In,Pe=t,ka(e,2),In=n,Pe=i),!a&&Ds||e0(e,a)),s&4&&(t=e.updateQueue,t!==null&&(n=t.retryQueue,n!==null&&(t.retryQueue=null,yh(e,n))));break;case 19:ci(t,e,n),ui(e),s&4&&(t=e.updateQueue,t!==null&&(e.updateQueue=null,yh(e,t)));break;case 30:s&512&&(Pe||i===null||Vn(i,i.return)),s=dx(),a=Pc,r=(n&335544064)===n,o=e.memoizedProps,Pc=r&&va(o.default,o.update)!=="none",ci(t,e,n),ui(e),r&&i!==null&&Ne&&(e.flags|=4),Pc=a,Ne=s;break;case 21:break;case 7:s&512&&(Pe||i===null||Vn(i,i.return)),i&&i.stateNode!==null&&(i.stateNode._fragmentFiber=e);default:ci(t,e,n),ui(e)}}function ui(e){var t=e.flags;if(t&2){try{for(var n,i=e.return;i!==null;){if(US(i)){n=i;break}i=i.return}i=null;for(var s=e.return;s!==null;){if(ag(s)){var a=s.stateNode;i===null?i=[a]:i.push(a)}if(sg(s))break;s=s.return}var r=i;if(n==null)throw Error(at(160));switch(n.tag){case 27:var o=n.stateNode,l=em(e);lf(e,l,o,r);break;case 5:var c=n.stateNode;n.flags&32&&(pl(c,""),n.flags&=-33);var u=em(e);lf(e,u,c,r);break;case 3:case 4:var d=n.stateNode.containerInfo,h=em(e);Km(e,h,d,r);break;default:throw Error(at(161))}}catch(p){Ge(e,e.return,p)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function WS(e){if(e.subtreeFlags&1024)for(e=e.child;e!==null;){var t=e;WS(t),t.tag===5&&t.flags&1024&&(t=t.stateNode,Ml=!0,t.reset(),Ml=!1),e=e.sibling}}function Ho(e,t){if(t.subtreeFlags&9270)for(t=t.child;t!==null;)qS(t,e),t=t.sibling;else zS(t,!1)}function qS(e,t){var n=e.alternate;if(n===null)jm(e,!1);else switch(e.tag){case 3:if(t0=Ns=!1,r1(),Ho(t,e),!Ns&&!uf){if(e=Os,e!==null)for(var i=0;i<e.length;i+=3){n=e[i];var s=e[i+1];_M(n,e[i+2]),n=n.ownerDocument.documentElement,n!==null&&n.animate({opacity:[0,0],pointerEvents:["none","none"]},{duration:0,fill:"forwards",pseudoElement:"::view-transition-group("+s+")"})}e=t.containerInfo,e=e.nodeType===9?e.documentElement:e.ownerDocument.documentElement,e!==null&&e.style.viewTransitionName===""&&(e.style.viewTransitionName="none",e.animate({opacity:[0,0],pointerEvents:["none","none"]},{duration:0,fill:"forwards",pseudoElement:"::view-transition-group(root)"}),e.animate({width:[0,0],height:[0,0]},{duration:0,fill:"forwards",pseudoElement:"::view-transition"})),t0=!0}Os=null;break;case 5:Ho(t,e);break;case 4:i=Ns,Ns=!1,Ho(t,e),Ns&&(uf=!0),Ns=i;break;case 22:e.memoizedState===null&&(n.memoizedState!==null?jm(e,!1):Ho(t,e));break;case 30:i=Ns,s=r1(),Ns=!1,Ho(t,e),Ns&&(e.flags|=4);var a=e.memoizedProps,r=e.stateNode;t=ha(a,r),r=ha(n.memoizedProps,r);var o=va(a.default,a.update);o==="none"?t=!1:(a=n.memoizedState,n.memoizedState=null,n=e.child,xi=0,t=rg(e,n,t,r,o,a,!0),xi!==(a===null?0:a.length)&&(e.flags|=32)),(e.flags&4)!==0&&t?(vl(e,e.memoizedProps.onUpdate),Os=s):s!==null&&(s.push.apply(s,Os),Os=s),Ns=(e.flags&32)!==0?!0:i;break;default:Ho(t,e)}}function Us(e,t){if(t.subtreeFlags&8772)for(t=t.child;t!==null;)BS(e,t.alternate,t),t=t.sibling}function ka(e,t){for(e=e.child;e!==null;){var n=e,i=t;switch(n.tag){case 0:case 11:case 14:case 15:fr(4,n,n.return),ka(n,i);break;case 1:Vn(n,n.return);var s=n.stateNode;typeof s.componentWillUnmount=="function"&&NS(n,n.return,s),ka(n,i);break;case 27:(i&2)!==0&&RM(n.stateNode,n.type,n.memoizedProps);case 5:Vn(n,n.return),n.tag!==5&&n.tag!==27||qc(n),ka(n,i);break;case 6:qc(n);break;case 26:Vn(n,n.return),s=n.stateNode,n.memoizedState!==null||s===null||Pe||s.parentNode.removeChild(s),ka(n,i);break;case 22:n.memoizedState===null&&ka(n,i);break;case 30:Vn(n,n.return),ka(n,i);break;case 7:Vn(n,n.return);default:ka(n,i)}e=e.sibling}}function us(e,t,n){for(n=(t.subtreeFlags&8772)!==0?n:n&-2,t=t.child;t!==null;){var i=t.alternate,s=e,a=t,r=a.flags,o=(n&1)!==0;switch(a.tag){case 0:case 11:case 15:us(s,a,n),xu(4,a);break;case 1:if(us(s,a,n),i=a,s=i.stateNode,typeof s.componentDidMount=="function")try{s.componentDidMount()}catch(u){Ge(i,i.return,u)}if(i=a,s=i.updateQueue,s!==null){var l=i.stateNode;try{var c=s.shared.hiddenCallbacks;if(c!==null)for(s.shared.hiddenCallbacks=null,s=0;s<c.length;s++)Fb(c[s],l)}catch(u){Ge(i,i.return,u)}}o&&r&64&&DS(a),Ls(a,a.return);break;case 27:(n&2)!==0&&LS(a);case 5:a.tag!==5&&a.tag!==27||s1(a),us(s,a,n),o&&i===null&&r&4&&Zm(a),Ls(a,a.return);break;case 6:s1(a);break;case 26:l=a.stateNode,a.memoizedState!==null||l===null||In||_0(lu(l.ownerDocument),a.type,l),us(s,a,n),o&&i===null&&r&4&&Zm(a),Ls(a,a.return);break;case 12:us(s,a,n);break;case 31:us(s,a,n),o&&r&4&&GS(s,a);break;case 13:us(s,a,n),o&&r&4&&kS(s,a);break;case 22:a.memoizedState===null&&us(s,a,n),Ls(a,a.return);break;case 30:us(s,a,n),Ls(a,a.return);break;case 7:Ls(a,a.return);default:us(s,a,n)}t=t.sibling}}function og(e,t){var n=null;e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(n=e.memoizedState.cachePool.pool),e=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(e=t.memoizedState.cachePool.pool),e!==n&&(e!=null&&e.refCount++,n!=null&&yu(n))}function lg(e,t){e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&yu(e))}function Yi(e,t,n,i){var s=(n&335544064)===n;if(t.subtreeFlags&(s?10262:10256))for(t=t.child;t!==null;)YS(e,t,n,i),t=t.sibling;else s&&PS(t)}function YS(e,t,n,i){var s=(n&335544064)===n;s&&t.alternate===null&&t.return!==null&&t.return.alternate!==null&&Ih(t);var a=t.flags;switch(t.tag){case 0:case 11:case 15:Yi(e,t,n,i),a&2048&&xu(9,t);break;case 1:Yi(e,t,n,i);break;case 3:Yi(e,t,n,i),s&&t0&&(e=e.containerInfo,e=e.nodeType===9?e.body:e.nodeName==="HTML"?e.ownerDocument.body:e,e.style.viewTransitionName==="root"&&(e.style.viewTransitionName=""),e=e.ownerDocument.documentElement,e!==null&&e.style.viewTransitionName==="none"&&(e.style.viewTransitionName="")),a&2048&&(a=null,t.alternate!==null&&(a=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==a&&(t.refCount++,a!=null&&yu(a)));break;case 12:if(a&2048){Yi(e,t,n,i),a=t.stateNode;try{var r=t.memoizedProps,o=r.id,l=r.onPostCommit;typeof l=="function"&&l(o,t.alternate===null?"mount":"update",a.passiveEffectDuration,-0)}catch(c){Ge(t,t.return,c)}}else Yi(e,t,n,i);break;case 31:Yi(e,t,n,i);break;case 13:Yi(e,t,n,i);break;case 23:break;case 22:r=t.stateNode,o=t.alternate,t.memoizedState!==null?(s&&o!==null&&o.memoizedState===null&&Ih(o),r._visibility&2?Yi(e,t,n,i):Yc(e,t)):(s&&o!==null&&o.memoizedState!==null&&Ih(t),r._visibility&2?Yi(e,t,n,i):(r._visibility|=2,Go(e,t,n,i,(t.subtreeFlags&10256)!==0||!1))),a&2048&&og(o,t);break;case 24:Yi(e,t,n,i),a&2048&&lg(t.alternate,t);break;case 30:s&&(a=t.alternate,a!==null&&(Vs(a.child,!0),Vs(t.child,!0))),Yi(e,t,n,i);break;default:Yi(e,t,n,i)}}function Go(e,t,n,i,s){for(s=s&&((t.subtreeFlags&10256)!==0||!1),t=t.child;t!==null;){var a=e,r=t,o=n,l=i,c=r.flags;switch(r.tag){case 0:case 11:case 15:Go(a,r,o,l,s),xu(8,r);break;case 23:break;case 22:var u=r.stateNode;r.memoizedState!==null?u._visibility&2?Go(a,r,o,l,s):Yc(a,r):(u._visibility|=2,Go(a,r,o,l,s)),s&&c&2048&&og(r.alternate,r);break;case 24:Go(a,r,o,l,s),s&&c&2048&&lg(r.alternate,r);break;default:Go(a,r,o,l,s)}t=t.sibling}}function Yc(e,t){if(t.subtreeFlags&10256)for(t=t.child;t!==null;){var n=e,i=t,s=i.flags;switch(i.tag){case 22:Yc(n,i),s&2048&&og(i.alternate,i);break;case 24:Yc(n,i),s&2048&&lg(i.alternate,i);break;default:Yc(n,i)}t=t.sibling}}var Ur=8192;function Cr(e,t,n){if(e.subtreeFlags&Ur)for(e=e.child;e!==null;)ZS(e,t,n),e=e.sibling}function ZS(e,t,n){switch(e.tag){case 26:Cr(e,t,n),e.flags&Ur&&(e.memoizedState!==null?$R(n,hs,e.memoizedState,e.memoizedProps):(e=e.stateNode,(t&335544128)===t&&L1(n,e)));break;case 5:Cr(e,t,n),e.flags&Ur&&(e=e.stateNode,(t&335544128)===t&&L1(n,e));break;case 3:case 4:var i=hs;hs=lu(e.stateNode.containerInfo),Cr(e,t,n),hs=i;break;case 22:e.memoizedState===null&&(i=e.alternate,i!==null&&i.memoizedState!==null?(i=Ur,Ur=16777216,Cr(e,t,n),Ur=i):Cr(e,t,n));break;case 30:if((e.flags&Ur)!==0&&(i=e.memoizedProps.name,i!=null&&i!=="auto")){var s=e.stateNode;s.paired=null,Ui===null&&(Ui=new Map),Ui.set(i,s)}Cr(e,t,n);break;default:Cr(e,t,n)}}function KS(e){var t=e.alternate;if(t!==null&&(e=t.child,e!==null)){t.child=null;do t=e.sibling,e.sibling=null,e=t;while(e!==null)}}function Cc(e){var t=e.deletions;if((e.flags&16)!==0){if(t!==null)for(var n=0;n<t.length;n++){var i=t[n];Pn=i,QS(i,e)}KS(e)}if(e.subtreeFlags&10256)for(e=e.child;e!==null;)jS(e),e=e.sibling}function jS(e){switch(e.tag){case 0:case 11:case 15:Cc(e),e.flags&2048&&fr(9,e,e.return);break;case 3:Cc(e);break;case 12:Cc(e);break;case 22:var t=e.stateNode;e.memoizedState!==null&&t._visibility&2&&(e.return===null||e.return.tag!==13)?(t._visibility&=-3,Ph(e)):Cc(e);break;default:Cc(e)}}function Ph(e){var t=e.deletions;if((e.flags&16)!==0){if(t!==null)for(var n=0;n<t.length;n++){var i=t[n];Pn=i,QS(i,e)}KS(e)}for(e=e.child;e!==null;){switch(t=e,t.tag){case 0:case 11:case 15:fr(8,t,t.return),Ph(t);break;case 22:n=t.stateNode,n._visibility&2&&(n._visibility&=-3,Ph(t));break;default:Ph(t)}e=e.sibling}}function QS(e,t){for(;Pn!==null;){var n=Pn;switch(n.tag){case 0:case 11:case 15:fr(8,n,t);break;case 23:case 22:if(n.memoizedState!==null&&n.memoizedState.cachePool!==null){var i=n.memoizedState.cachePool.pool;i!=null&&i.refCount++}break;case 24:yu(n.memoizedState.cache)}if(i=n.child,i!==null)i.return=n,Pn=i;else t:for(n=e;Pn!==null;){i=Pn;var s=i.sibling,a=i.return;if(HS(i),i===n){Pn=null;break t}if(s!==null){s.return=a,Pn=s;break t}Pn=a}}}var j2={getCacheForType:function(e){var t=kn(bn),n=t.data.get(e);return n===void 0&&(n=e(),t.data.set(e,n)),n},cacheSignal:function(){return kn(bn).controller.signal}},Q2=typeof WeakMap=="function"?WeakMap:Map,Ue=0,Ke=null,Re=null,Ce=0,He=0,Ci=null,ja=!1,Cl=!1,cg=!1,ma=0,dn=0,dr=0,Fr=0,hf=0,Li=0,gl=0,Zc=null,_i=null,i0=!1,Lf=0,JS=0,ff=1/0,df=null,ar=null,cn=0,ds=null,Yr=null,Hs=0,s0=0,a0=null,$S=null,cl=null,ul=null,hl=null,Kc=0,zh=null;function zi(){return(Ue&2)!==0&&Ce!==0?Ce&-Ce:se.T!==null?hg():ib()}function tM(){if(Li===0)if((Ce&536870912)===0||Me){var e=ah;ah<<=1,(ah&3932160)===0&&(ah=262144),Li=e}else Li=536870912;return e=Yn.current,e!==null&&(e.flags|=32),Li}function vl(e,t){if(t!=null){var n=e.stateNode,i=n.ref;i===null&&(i=n.ref=bM(ha(e.memoizedProps,n))),ul===null&&(ul=[]),ul.push(t.bind(null,i))}}function Si(e,t,n){(e===Ke&&(He===2||He===9)||e.cancelPendingCommit!==null)&&(yl(e,0),Qa(e,Ce,Li,!1)),mu(e,n),((Ue&2)===0||e!==Ke)&&(e===Ke&&((Ue&2)===0&&(Fr|=n),dn===4&&Qa(e,Ce,Li,!1)),ks(e))}function eM(e,t,n){if((Ue&6)!==0)throw Error(at(327));var i=!n&&(t&127)===0&&(t&e.expiredLanes)===0||pu(e,t),s=i?tR(e,t):im(e,t,!0),a=i;do{if(s===0){Cl&&!i&&Qa(e,t,0,!1);break}else{if(n=e.current.alternate,a&&!J2(n)){s=im(e,t,!1),a=!1;continue}if(s===2){if(a=t,e.errorRecoveryDisabledLanes&a)var r=0;else r=e.pendingLanes&-536870913,r=r!==0?r:r&536870912?536870912:0;if(r!==0){t=r;t:{var o=e;s=Zc;var l=o.current.memoizedState.isDehydrated;if(l&&(yl(o,r).flags|=256),r=im(o,r,!1),r!==2&&r!==6){if(cg&&!l){o.errorRecoveryDisabledLanes|=a,Fr|=a,s=4;break t}a=_i,_i=s,a!==null&&(_i===null?_i=a:_i.push.apply(_i,a))}s=r}if(a=!1,s!==2)continue}}if(s===1){yl(e,0),Qa(e,t,0,!0);break}t:{switch(i=e,a=s,a){case 0:case 1:throw Error(at(345));case 4:if((t&4194048)!==t&&(t&62914560)!==t)break;case 6:Qa(i,t,Li,!ja);break t;case 2:_i=null;break;case 3:case 5:break;default:throw Error(at(329))}if((t&62914560)===t&&(s=Lf+300-Oi(),10<s)){if(Qa(i,t,Li,!ja),_f(i,0,!0)!==0)break t;Hs=t,i.timeoutHandle=dg(l1.bind(null,i,n,_i,df,i0,t,Li,Fr,gl,ja,a,"Throttled",-0,0),s);break t}l1(i,n,_i,df,i0,t,Li,Fr,gl,ja,a,null,-0,0)}}break}while(!0);ks(e)}function l1(e,t,n,i,s,a,r,o,l,c,u,d,h,p){e.timeoutHandle=-1;var g=t.subtreeFlags,S=(a&335544064)===a;if(d=null,(S||g&8192||(g&16785408)===16785408)&&(d={stylesheets:null,count:0,imgCount:0,imgBytes:0,suspenseyImages:[],waitingForImages:!0,waitingForViewTransition:!1,unsuspend:Ps},Ui=null,ZS(t,a,d),S&&(g=d,S=e.containerInfo,S=(S.nodeType===9?S:S.ownerDocument).__reactViewTransition,S!=null&&(g.count++,g.waitingForViewTransition=!0,g=cu.bind(g),S.finished.then(g,g))),g=(a&62914560)===a?Lf-Oi():(a&4194048)===a?JS-Oi():0,g=tC(d,g),g!==null)){Hs=a,e.cancelPendingCommit=g(u1.bind(null,e,t,a,n,i,s,r,o,l,c,u,d,null,h,p)),Qa(e,a,r,!c);return}u1(e,t,a,n,i,s,r,o,l,c,u,d)}function J2(e){for(var t=e;;){var n=t.tag;if((n===0||n===11||n===15)&&t.flags&16384&&(n=t.updateQueue,n!==null&&(n=n.stores,n!==null)))for(var i=0;i<n.length;i++){var s=n[i],a=s.getSnapshot;s=s.value;try{if(!Bi(a(),s))return!1}catch{return!1}}if(n=t.child,t.subtreeFlags&16384&&n!==null)n.return=t,t=n;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function Qa(e,t,n,i){t=J1(e,t),t&=~hf,t&=~Fr,e.suspendedLanes|=t,e.pingedLanes&=~t,i&&(e.warmLanes|=t),i=e.expirationTimes;for(var s=t;0<s;){var a=31-Pi(s),r=1<<a;i[a]=-1,s&=~r}n!==0&&tb(e,n,t)}function Of(){return(Ue&6)===0?(bu(0,!1),!1):!0}function ug(){if(Re!==null){if(He===0)var e=Re.return;else e=Re,oa=Jr=null,Y0(e),rl=null,nu=0,e=Re;for(;e!==null;)CS(e.alternate,e),e=e.return;Re=null}}function yl(e,t){var n=e.timeoutHandle;return n!==-1&&(e.timeoutHandle=-1,xR(n)),n=e.cancelPendingCommit,n!==null&&(e.cancelPendingCommit=null,n()),Hs=0,ug(),Ke=e,Re=n=la(e.current,null),Ce=t,He=0,Ci=null,ja=!1,Cl=pu(e,t),cg=!1,gl=Li=hf=Fr=dr=dn=0,_i=Zc=null,i0=!1,ma=J1(e,t),Ef(),n}function nM(e,t){he=null,se.H=af,t===wl||t===wf?(t=Ix(),He=3):t===F0?(t=Ix(),He=4):He=t===eg?8:t!==null&&typeof t=="object"&&typeof t.then=="function"?6:1,Ci=t,Re===null&&(dn=1,rf(e,Ji(t,e.current)))}function iM(){var e=Yn.current;return e===null?!0:(Ce&4194048)===Ce?$n===null:(Ce&62914560)===Ce||(Ce&536870912)!==0?e===$n:!1}function sM(){var e=se.H;return se.H=af,e===null?af:e}function aM(){var e=se.A;return se.A=j2,e}function pf(){dn=4,ja||(Ce&4194048)!==Ce&&Yn.current!==null||(Cl=!0),(dr&134217727)===0&&(Fr&134217727)===0||Ke===null||Qa(Ke,Ce,Li,!1)}function im(e,t,n){var i=Ue;Ue|=2;var s=sM(),a=aM();(Ke!==e||Ce!==t)&&(df=null,yl(e,t)),t=!1;var r=dn;t:do try{if(He!==0&&Re!==null){var o=Re,l=Ci;switch(He){case 8:ug(),r=6;break t;case 3:case 2:case 9:case 6:Yn.current===null&&(t=!0);var c=He;if(He=0,Ci=null,el(e,o,l,c),n&&Cl){r=0;break t}break;default:c=He,He=0,Ci=null,el(e,o,l,c)}}$2(),r=dn;break}catch(u){nM(e,u)}while(!0);return t&&e.shellSuspendCounter++,oa=Jr=null,Ue=i,se.H=s,se.A=a,Re===null&&(Ke=null,Ce=0,Ef()),r}function $2(){for(;Re!==null;)rM(Re)}function tR(e,t){var n=Ue;Ue|=2;var i=sM(),s=aM();Ke!==e||Ce!==t?(df=null,ff=Oi()+500,yl(e,t)):Cl=pu(e,t);t:do try{if(He!==0&&Re!==null){t=Re;var a=Ci;e:switch(He){case 1:He=0,Ci=null,el(e,t,a,1);break;case 2:case 9:if(Ox(a)){He=0,Ci=null,c1(t);break}t=function(){He!==2&&He!==9||Ke!==e||(He=7),ks(e)},a.then(t,t);break t;case 3:He=7;break t;case 4:He=5;break t;case 7:Ox(a)?(He=0,Ci=null,c1(t)):(He=0,Ci=null,el(e,t,a,7));break;case 5:var r=null;switch(Re.tag){case 26:r=Re.memoizedState;case 5:case 27:var o=Re;if(r?NM(r):o.stateNode.complete){He=0,Ci=null;var l=o.sibling;if(l!==null)Re=l;else{var c=o.return;c!==null?(Re=c,If(c)):Re=null}break e}}He=0,Ci=null,el(e,t,a,5);break;case 6:He=0,Ci=null,el(e,t,a,6);break;case 8:ug(),dn=6;break t;default:throw Error(at(462))}}eR();break}catch(u){nM(e,u)}while(!0);return oa=Jr=null,se.H=i,se.A=s,Ue=n,Re!==null?0:(Ke=null,Ce=0,Ef(),dn)}function eR(){for(;Re!==null&&!yw();)rM(Re)}function rM(e){var t=RS(e.alternate,e,ma);e.memoizedProps=e.pendingProps,t===null?If(e):Re=t}function c1(e){var t=e,n=t.alternate;switch(t.tag){case 15:case 0:t=Qx(n,t,t.pendingProps,t.type,void 0,Ce);break;case 11:t=Qx(n,t,t.pendingProps,t.type.render,t.ref,Ce);break;case 5:Y0(t);var i=t;i===Bn&&(Me?(Qh(i),i.tag===5&&i.stateNode!=null&&($e=i.stateNode)):(Qh(i),Me=!0));default:CS(n,t),t=Re=Db(t,ma),t=RS(n,t,ma)}e.memoizedProps=e.pendingProps,t===null?If(e):Re=t}function el(e,t,n,i){oa=Jr=null,Y0(t),rl=null,nu=0;var s=t.return;try{if(G2(e,s,t,n,Ce)){dn=1,rf(e,Ji(n,e.current)),Re=null;return}}catch(a){if(s!==null)throw Re=s,a;dn=1,rf(e,Ji(n,e.current)),Re=null;return}t.flags&32768?(Me||i===1?e=!0:Cl||(Ce&536870912)!==0?e=!1:(ja=e=!0,(i===2||i===9||i===3||i===6)&&(i=Yn.current,i!==null&&i.tag===13&&(i.flags|=16384))),oM(t,e)):If(t)}function If(e){var t=e;do{if((t.flags&32768)!==0){oM(t,ja);return}e=t.return;var n=q2(t.alternate,t,ma);if(n!==null){Re=n;return}if(t=t.sibling,t!==null){Re=t;return}Re=t=e}while(t!==null);dn===0&&(dn=5)}function oM(e,t){do{var n=Y2(e.alternate,e);if(n!==null){n.flags&=32767,Re=n;return}if(n=e.return,n!==null&&(n.flags|=32768,n.subtreeFlags=0,n.deletions=null),!t&&(e=e.sibling,e!==null)){Re=e;return}Re=e=n}while(e!==null);dn=6,Re=null}function u1(e,t,n,i,s,a,r,o,l,c,u,d){e.cancelPendingCommit=null;do Pf();while(cn!==0);if((Ue&6)!==0)throw Error(at(327));if(t!==null){if(t===e.current)throw Error(at(177));e===Ke&&(Re=Ke=null,Ce=0),Yr=t,ds=e,Hs=n,a0=s,$S=i,nR(e,t,n,r,o,l,d)}}function nR(e,t,n,i,s,a,r){var o=t.lanes|t.childLanes;if(s0=o,o|=L0,Rw(e,n,o,i,s,a),ul=null,(n&335544064)===n?(hl=D2(e),i=10262):(hl=null,i=10256),(t.subtreeFlags&i)!==0||(t.flags&i)!==0?(e.callbackNode=null,e.callbackPriority=0,lR(qh,function(){return c0(),null})):(e.callbackNode=null,e.callbackPriority=0),cf=!1,i=(t.flags&13878)!==0,(t.subtreeFlags&13878)!==0||i){i=se.T,se.T=null,s=Le.p,Le.p=2,a=Ue,Ue|=4;try{Z2(e,t,n)}finally{Ue=a,Le.p=s,se.T=i}}cn=1,cf?cl=AR(r,e.containerInfo,hl,r0,o0,sR,l0,c0,iR,null,null):(r0(),o0(),l0())}function iR(e){if(cn!==0){var t=ds.onRecoverableError;t(e,{componentStack:null})}}function sR(){cn===3&&(cn=0,qS(Yr,ds),cn=4)}function r0(){if(cn===1){cn=0;var e=ds,t=Yr,n=Hs,i=(t.flags&13878)!==0;if((t.subtreeFlags&13878)!==0||i){i=se.T,se.T=null;var s=Le.p;Le.p=2;var a=Ue;Ue|=4;try{Pc=uf=!1,XS(t,e,n),n=d0;var r=Sb(e.containerInfo),o=n.focusedElem,l=n.selectionRange;if(r!==o&&o&&o.ownerDocument&&bb(o.ownerDocument.documentElement,o)){if(l!==null&&U0(o)){var c=l.start,u=l.end;if(u===void 0&&(u=c),"selectionStart"in o)o.selectionStart=c,o.selectionEnd=Math.min(u,o.value.length);else{var d=o.ownerDocument||document,h=d&&d.defaultView||window;if(h.getSelection){var p=h.getSelection(),g=o.textContent.length,S=Math.min(l.start,g),m=l.end===void 0?S:Math.min(l.end,g);!p.extend&&S>m&&(r=m,m=S,S=r);var f=Ax(o,S),y=Ax(o,m);if(f&&y&&(p.rangeCount!==1||p.anchorNode!==f.node||p.anchorOffset!==f.offset||p.focusNode!==y.node||p.focusOffset!==y.offset)){var _=d.createRange();_.setStart(f.node,f.offset),p.removeAllRanges(),S>m?(p.addRange(_),p.extend(y.node,y.offset)):(_.setEnd(y.node,y.offset),p.addRange(_))}}}}for(d=[],p=o;p=p.parentNode;)p.nodeType===1&&d.push({element:p,left:p.scrollLeft,top:p.scrollTop});for(typeof o.focus=="function"&&o.focus(),o=0;o<d.length;o++){var b=d[o];b.element.scrollLeft=b.left,b.element.scrollTop=b.top}}Ml=!!f0,d0=f0=null}finally{Ue=a,Le.p=s,se.T=i}}e.current=t,cn=2}}function o0(){if(cn===2){cn=0;var e=ds,t=Yr,n=(t.flags&8772)!==0;if((t.subtreeFlags&8772)!==0||n){n=se.T,se.T=null;var i=Le.p;Le.p=2;var s=Ue;Ue|=4;try{BS(e,t.alternate,t)}finally{Ue=s,Le.p=i,se.T=n}}cn=3}}function l0(){if(cn===4||cn===3){cn=0;var e=cl;cl=null,_w();var t=ds,n=Yr,i=Hs,s=$S,a=(i&335544064)===i?10262:10256;if((n.subtreeFlags&a)!==0||(n.flags&a)!==0?cn=5:(cn=0,Yr=ds=null,lM(t,t.pendingLanes)),a=t.pendingLanes,a===0&&(ar=null),A0(i),n=n.stateNode,Ii&&typeof Ii.onCommitFiberRoot=="function")try{Ii.onCommitFiberRoot(du,n,void 0,(n.current.flags&128)===128)}catch{}if(s!==null){n=se.T,a=Le.p,Le.p=2,se.T=null;try{for(var r=t.onRecoverableError,o=0;o<s.length;o++){var l=s[o];r(l.value,{componentStack:l.stack})}}finally{se.T=n,Le.p=a}}if(s=ul,r=hl,hl=null,s!==null&&(ul=null,r===null&&(r=[]),e!==null))for(l=0;l<s.length;l++)n=(0,s[l])(r),n!==void 0&&e.finished.finally(n);(Hs&3)!==0&&Pf(),ks(t),a=t.pendingLanes,(i&261930)!==0&&(a&42)!==0?t===zh?Kc++:(Kc=0,zh=t):(Kc=0,zh=null),bu(0,!1)}}function lM(e,t){(e.pooledCacheLanes&=t)===0&&(t=e.pooledCache,t!=null&&(e.pooledCache=null,yu(t)))}function Pf(){return cl!==null&&(cl.skipTransition(),cl=null),r0(),o0(),l0(),c0()}function c0(){if(cn!==5)return!1;var e=ds,t=s0;s0=0;var n=A0(Hs),i=se.T,s=Le.p;try{Le.p=32>n?32:n,se.T=null,n=a0,a0=null;var a=ds,r=Hs;if(cn=0,Yr=ds=null,Hs=0,(Ue&6)!==0)throw Error(at(331));var o=Ue;if(Ue|=4,jS(a.current),YS(a,a.current,r,n),Ue=o,bu(0,!1),Ii&&typeof Ii.onPostCommitFiberRoot=="function")try{Ii.onPostCommitFiberRoot(du,a)}catch{}return!0}finally{Le.p=s,se.T=i,lM(e,t)}}function h1(e,t,n){t=Ji(n,t),t=Gm(e.stateNode,t,2),e=nr(e,t,2),e!==null&&(mu(e,2),ks(e))}function Ge(e,t,n){if(e.tag===3)h1(e,e,n);else for(;t!==null;){if(t.tag===3){h1(t,e,n);break}else if(t.tag===1){var i=t.stateNode;if(typeof t.type.getDerivedStateFromError=="function"||typeof i.componentDidCatch=="function"&&(ar===null||!ar.has(i))){e=Ji(n,e),n=MS(2),i=nr(t,n,2),i!==null&&(ES(n,i,t,e),mu(i,2),ks(i));break}}t=t.return}}function sm(e,t,n){var i=e.pingCache;if(i===null){i=e.pingCache=new Q2;var s=new Set;i.set(t,s)}else s=i.get(t),s===void 0&&(s=new Set,i.set(t,s));s.has(n)||(cg=!0,s.add(n),e=aR.bind(null,e,t,n),t.then(e,e))}function aR(e,t,n){var i=e.pingCache;i!==null&&i.delete(t),e.pingedLanes|=e.suspendedLanes&n,e.warmLanes&=~n,Ke===e&&(Ce&n)===n&&((dn===4||dn===3&&(Ce&62914560)===Ce&&300>Oi()-Lf)&&(Ue&2)===0?yl(e,0):hf|=n,gl===Ce&&(gl=0)),ks(e)}function cM(e,t){t===0&&(t=$1()),e=Qr(e,t),e!==null&&(mu(e,t),ks(e))}function rR(e){var t=e.memoizedState,n=0;t!==null&&(n=t.retryLane),cM(e,n)}function oR(e,t){var n=0;switch(e.tag){case 31:case 13:var i=e.stateNode,s=e.memoizedState;s!==null&&(n=s.retryLane);break;case 19:i=e.stateNode;break;case 22:i=e.stateNode._retryCache;break;default:throw Error(at(314))}i!==null&&i.delete(t),cM(e,n)}function lR(e,t){return E0(e,t)}var _l=null,ko=null,u0=!1,mf=!1,am=!1,Ja=0;function ks(e){e!==ko&&e.next===null&&(ko===null?_l=ko=e:ko=ko.next=e),mf=!0,u0||(u0=!0,uR())}function bu(e,t){if(!am&&mf){am=!0;do for(var n=!1,i=_l;i!==null;){if(!t)if(e!==0){var s=i.pendingLanes;if(s===0)var a=0;else{var r=i.suspendedLanes,o=i.pingedLanes;a=(1<<31-Pi(42|e)+1)-1,a&=s&~(r&~o),a=a&201326741?a&201326741|1:a?a|2:0}a!==0&&(n=!0,f1(i,a))}else a=Ce,a=_f(i,i===Ke?a:0,i.cancelPendingCommit!==null||i.timeoutHandle!==-1),(a&3)===0||pu(i,a)||(n=!0,f1(i,a));i=i.next}while(n);am=!1}}function cR(){uM()}function uM(){mf=u0=!1;var e=0;Ja!==0&&_R()&&(e=Ja);for(var t=Oi(),n=null,i=_l;i!==null;){var s=i.next,a=hM(i,t);a===0?(i.next=null,n===null?_l=s:n.next=s,s===null&&(ko=n)):(n=i,(e!==0||(a&3)!==0)&&(mf=!0)),i=s}cn!==0&&cn!==5||bu(e,!1),Ja!==0&&(Ja=0)}function hM(e,t){for(var n=e.suspendedLanes,i=e.pingedLanes,s=e.expirationTimes,a=e.pendingLanes&-62914561;0<a;){var r=31-Pi(a),o=1<<r,l=s[r];l===-1?((o&n)===0||(o&i)!==0)&&(s[r]=ww(o,t)):l<=t&&(e.expiredLanes|=o),a&=~o}if(t=Ke,n=Ce,n=_f(e,e===t?n:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),i=e.callbackNode,n===0||e===t&&(He===2||He===9)||e.cancelPendingCommit!==null)return i!==null&&i!==null&&zp(i),e.callbackNode=null,e.callbackPriority=0;if((n&3)===0||pu(e,n)){if(t=n&-n,t===e.callbackPriority)return t;switch(i!==null&&zp(i),A0(n)){case 2:case 8:n=j1;break;case 32:n=qh;break;case 268435456:n=Q1;break;default:n=qh}return i=fM.bind(null,e),n=E0(n,i),e.callbackPriority=t,e.callbackNode=n,t}return i!==null&&i!==null&&zp(i),e.callbackPriority=2,e.callbackNode=null,2}function fM(e,t){if(cn!==0&&cn!==5)return e.callbackNode=null,e.callbackPriority=0,null;var n=e.callbackNode;if(Pf()&&e.callbackNode!==n)return null;var i=Ce;return i=_f(e,e===Ke?i:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),i===0?null:(eM(e,i,t),hM(e,Oi()),e.callbackNode!=null&&e.callbackNode===n?fM.bind(null,e):null)}function f1(e,t){if(Pf())return null;eM(e,t,!0)}function uR(){bR(function(){(Ue&6)!==0?E0(K1,cR):uM()})}function hg(){if(Ja===0){var e=kr;e===0&&(e=sh,sh<<=1,(sh&261888)===0&&(sh=256)),Ja=e}return Ja}function d1(e){return e==null||typeof e=="symbol"||typeof e=="boolean"?null:typeof e=="function"?e:Th(e)}function hR(e,t,n,i,s){if(t==="submit"&&n&&n.stateNode===s){var a=d1((s[Ei]||null).action),r=i.submitter;r&&(t=(t=r[Ei]||null)?d1(t.formAction):r.getAttribute("formAction"),t!==null&&(a=t,r=null));var o=new bf("action","action",null,i,s);e.push({event:o,listeners:[{instance:null,listener:function(){if(i.defaultPrevented){if(Ja!==0){var l=new FormData(s,r);Hm(n,{pending:!0,data:l,method:s.method,action:a},null,l)}}else typeof a=="function"&&(o.preventDefault(),l=new FormData(s,r),Hm(n,{pending:!0,data:l,method:s.method,action:a},a,l))},currentTarget:s}]})}}for(_h=0;_h<Cm.length;_h++)xh=Cm[_h],p1=xh.toLowerCase(),m1=xh[0].toUpperCase()+xh.slice(1),ps(p1,"on"+m1);var xh,p1,m1,_h;ps(Eb,"onAnimationEnd");ps(Tb,"onAnimationIteration");ps(Ab,"onAnimationStart");ps("dblclick","onDoubleClick");ps("focusin","onFocus");ps("focusout","onBlur");ps(S2,"onTransitionRun");ps(M2,"onTransitionStart");ps(E2,"onTransitionCancel");ps(wb,"onTransitionEnd");dl("onMouseEnter",["mouseout","mouseover"]);dl("onMouseLeave",["mouseout","mouseover"]);dl("onPointerEnter",["pointerout","pointerover"]);dl("onPointerLeave",["pointerout","pointerover"]);Kr("onChange","change click focusin focusout input keydown keyup selectionchange".split(" "));Kr("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));Kr("onBeforeInput",["compositionend","keypress","textInput","paste"]);Kr("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" "));Kr("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" "));Kr("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var au="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),fR=new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(au));function dM(e,t){t=(t&4)!==0;for(var n=0;n<e.length;n++){var i=e[n],s=i.event;i=i.listeners;t:{var a=void 0;if(t)for(var r=i.length-1;0<=r;r--){var o=i[r],l=o.instance,c=o.currentTarget;if(o=o.listener,l!==a&&s.isPropagationStopped())break t;a=o,s.currentTarget=c;try{a(s)}catch(u){Zh(u)}s.currentTarget=null,a=l}else for(r=0;r<i.length;r++){if(o=i[r],l=o.instance,c=o.currentTarget,o=o.listener,l!==a&&s.isPropagationStopped())break t;a=o,s.currentTarget=c;try{a(s)}catch(u){Zh(u)}s.currentTarget=null,a=l}}}}function we(e,t){var n=t[cx];n===void 0&&(n=t[cx]=new Set);var i=e+"__bubble";n.has(i)||(pM(t,e,2,!1),n.add(i))}function rm(e,t,n){var i=0;t&&(i|=4),pM(n,e,i,t)}var bh="_reactListening"+Math.random().toString(36).slice(2);function fg(e){if(!e[bh]){e[bh]=!0,ab.forEach(function(n){n!=="selectionchange"&&(fR.has(n)||rm(n,!1,e),rm(n,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[bh]||(t[bh]=!0,rm("selectionchange",!1,t))}}function pM(e,t,n,i){switch(BM(t)){case 2:var s=sC;break;case 8:s=aC;break;default:s=_g}n=s.bind(null,t,n,e),s=void 0,!Tm||t!=="touchstart"&&t!=="touchmove"&&t!=="wheel"||(s=!0),i?s!==void 0?e.addEventListener(t,n,{capture:!0,passive:s}):e.addEventListener(t,n,!0):s!==void 0?e.addEventListener(t,n,{passive:s}):e.addEventListener(t,n,!1)}function om(e,t,n,i,s){var a=i;if((t&1)===0&&(t&2)===0&&i!==null)t:for(;;){if(i===null)return;var r=i.tag;if(r===3||r===4){var o=i.stateNode.containerInfo;if(o===s)break;if(r===4)for(r=i.return;r!==null;){var l=r.tag;if((l===3||l===4)&&r.stateNode.containerInfo===s)return;r=r.return}for(;o!==null;){if(r=Lr(o),r===null)return;if(l=r.tag,l===5||l===6||l===26||l===27){i=a=r;continue t}o=o.parentNode}}i=i.return}db(function(){var c=a,u=R0(n),d=[];t:{var h=Rb.get(e);if(h!==void 0){var p=bf,g=e;switch(e){case"keypress":if(wh(n)===0)break t;case"keydown":case"keyup":p=Jw;break;case"focusin":g="focus",p=kp;break;case"focusout":g="blur",p=kp;break;case"beforeblur":case"afterblur":p=kp;break;case"click":if(n.button===2)break t;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":p=vx;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":p=Hw;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":p=i2;break;case Eb:case Tb:case Ab:p=kw;break;case wb:p=a2;break;case"scroll":case"scrollend":p=Bw;break;case"wheel":p=o2;break;case"copy":case"cut":case"paste":p=Ww;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":p=_x;break;case"submit":p=e2;break;case"toggle":case"beforetoggle":p=c2}var S=(t&4)!==0,m=!S&&(e==="scroll"||e==="scrollend"),f=S?h!==null?h+"Capture":null:h;S=[];for(var y=c,_;y!==null;){var b=y;if(_=b.stateNode,b=b.tag,b!==5&&b!==26&&b!==27||_===null||f===null||(b=Qc(y,f),b!=null&&S.push(ru(y,b,_))),m)break;y=y.return}0<S.length&&(h=new p(h,g,null,n,u),d.push({event:h,listeners:S}))}}if((t&7)===0){t:{if(p=e==="mouseover"||e==="pointerover",h=e==="mouseout"||e==="pointerout",p&&n!==Em&&(g=n.relatedTarget||n.fromElement)&&(Lr(g)||g[Tl]))break t;(h||p)&&(g=u.window===u?u:(p=u.ownerDocument)?p.defaultView||p.parentWindow:window,h?(p=n.relatedTarget||n.toElement,h=c,p=p?Lr(p):null,p!==null&&(m=fu(p),S=p.tag,p!==m||S!==5&&S!==27&&S!==6)&&(p=null)):(h=null,p=c),h!==p&&(S=vx,b="onMouseLeave",f="onMouseEnter",y="mouse",(e==="pointerout"||e==="pointerover")&&(S=_x,b="onPointerLeave",f="onPointerEnter",y="pointer"),m=h==null?g:Oc(h),_=p==null?g:Oc(p),g=new S(b,y+"leave",h,n,u),g.target=m,g.relatedTarget=_,b=null,Lr(u)===c&&(S=new S(f,y+"enter",p,n,u),S.target=_,S.relatedTarget=m,b=S),m=b,S=h&&p?fm(h,p,dR):null,h!==null&&g1(d,g,h,S,!1),p!==null&&m!==null&&g1(d,m,p,S,!0)))}t:{if(h=c?Oc(c):window,p=h.nodeName&&h.nodeName.toLowerCase(),p==="select"||p==="input"&&h.type==="file")var D=Mx;else if(Sx(h))if(_b)D=_2;else{D=v2;var R=g2}else p=h.nodeName,!p||p.toLowerCase()!=="input"||h.type!=="checkbox"&&h.type!=="radio"?c&&w0(c.elementType)&&(D=Mx):D=y2;if(D&&(D=D(e,c))){yb(d,D,n,u);break t}R&&R(e,h,c)}switch(R=c?Oc(c):window,e){case"focusin":(Sx(R)||R.contentEditable==="true")&&(Ko=R,wm=c,Fc=null);break;case"focusout":Fc=wm=Ko=null;break;case"mousedown":Rm=!0;break;case"contextmenu":case"mouseup":case"dragend":Rm=!1,wx(d,n,u);break;case"selectionchange":if(b2)break;case"keydown":case"keyup":wx(d,n,u)}var A;if(N0)t:{switch(e){case"compositionstart":var N="onCompositionStart";break t;case"compositionend":N="onCompositionEnd";break t;case"compositionupdate":N="onCompositionUpdate";break t}N=void 0}else Zo?gb(e,n)&&(N="onCompositionEnd"):e==="keydown"&&n.keyCode===229&&(N="onCompositionStart");N&&(mb&&n.locale!=="ko"&&(Zo||N!=="onCompositionStart"?N==="onCompositionEnd"&&Zo&&(A=pb()):(Za=u,C0="value"in Za?Za.value:Za.textContent,Zo=!0)),R=gf(c,N),0<R.length&&(N=new yx(N,e,null,n,u),d.push({event:N,listeners:R}),A?N.data=A:(A=vb(n),A!==null&&(N.data=A)))),(A=h2?f2(e,n):d2(e,n))&&(N=gf(c,"onBeforeInput"),0<N.length&&(R=new yx("onBeforeInput","beforeinput",null,n,u),d.push({event:R,listeners:N}),R.data=A)),hR(d,e,c,n,u)}dM(d,t)})}function ru(e,t,n){return{instance:e,listener:t,currentTarget:n}}function gf(e,t){for(var n=t+"Capture",i=[];e!==null;){var s=e,a=s.stateNode;if(s=s.tag,s!==5&&s!==26&&s!==27||a===null||(s=Qc(e,n),s!=null&&i.unshift(ru(e,s,a)),s=Qc(e,t),s!=null&&i.push(ru(e,s,a))),e.tag===3)return i;e=e.return}return[]}function dR(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5&&e.tag!==27);return e||null}function g1(e,t,n,i,s){for(var a=t._reactName,r=[];n!==null&&n!==i;){var o=n,l=o.alternate,c=o.stateNode;if(o=o.tag,l!==null&&l===i)break;o!==5&&o!==26&&o!==27||c===null||(l=c,s?(c=Qc(n,a),c!=null&&r.unshift(ru(n,c,l))):s||(c=Qc(n,a),c!=null&&r.push(ru(n,c,l)))),n=n.return}r.length!==0&&e.push({event:t,listeners:r})}var pR=/\r\n?/g,mR=/\u0000|\uFFFD/g;function v1(e){return(typeof e=="string"?e:""+e).replace(pR,`
`).replace(mR,"")}function mM(e,t){return t=v1(t),v1(e)===t}function Ve(e,t,n,i,s,a){switch(n){case"children":if(typeof i=="string")t==="body"||t==="textarea"&&i===""||pl(e,i);else if(typeof i=="number"||typeof i=="bigint")t!=="body"&&pl(e,""+i);else return;break;case"className":oh(e,"class",i);break;case"tabIndex":oh(e,"tabindex",i);break;case"dir":case"role":case"viewBox":case"width":case"height":oh(e,n,i);break;case"style":fb(e,i,a);return;case"data":if(t!=="object"){oh(e,"data",i);break}case"src":case"href":if(i===""&&(t!=="a"||n!=="href")){e.removeAttribute(n);break}if(i==null||typeof i=="function"||typeof i=="symbol"||typeof i=="boolean"){e.removeAttribute(n);break}i=Th(i),e.setAttribute(n,i);break;case"action":case"formAction":if(typeof i=="function"){e.setAttribute(n,"javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");break}else typeof a=="function"&&(n==="formAction"?(t!=="input"&&Ve(e,t,"name",s.name,s,null),Ve(e,t,"formEncType",s.formEncType,s,null),Ve(e,t,"formMethod",s.formMethod,s,null),Ve(e,t,"formTarget",s.formTarget,s,null)):(Ve(e,t,"encType",s.encType,s,null),Ve(e,t,"method",s.method,s,null),Ve(e,t,"target",s.target,s,null)));if(i==null||typeof i=="symbol"||typeof i=="boolean"){e.removeAttribute(n);break}i=Th(i),e.setAttribute(n,i);break;case"onClick":i!=null&&(e.onclick=Ps);return;case"onScroll":i!=null&&we("scroll",e);return;case"onScrollEnd":i!=null&&we("scrollend",e);return;case"dangerouslySetInnerHTML":if(i!=null){if(typeof i!="object"||!("__html"in i))throw Error(at(61));if(n=i.__html,n!=null){if(s.children!=null)throw Error(at(60));a?.__html!==n&&(e.innerHTML=n)}}break;case"multiple":e.multiple=i&&typeof i!="function"&&typeof i!="symbol";break;case"muted":e.muted=i&&typeof i!="function"&&typeof i!="symbol";break;case"suppressContentEditableWarning":case"suppressHydrationWarning":case"defaultValue":case"defaultChecked":case"innerHTML":case"ref":break;case"autoFocus":break;case"xlinkHref":if(i==null||typeof i=="function"||typeof i=="boolean"||typeof i=="symbol"){e.removeAttribute("xlink:href");break}n=Th(i),e.setAttributeNS("http://www.w3.org/1999/xlink","xlink:href",n);break;case"contentEditable":case"spellCheck":case"draggable":case"value":case"autoReverse":case"externalResourcesRequired":case"focusable":case"preserveAlpha":i!=null&&typeof i!="function"&&typeof i!="symbol"?e.setAttribute(n,i):e.removeAttribute(n);break;case"inert":case"allowFullScreen":case"async":case"autoPlay":case"controls":case"credentialless":case"default":case"defer":case"disabled":case"disablePictureInPicture":case"disableRemotePlayback":case"formNoValidate":case"hidden":case"loop":case"noModule":case"noValidate":case"open":case"playsInline":case"readOnly":case"required":case"reversed":case"scoped":case"seamless":case"itemScope":i&&typeof i!="function"&&typeof i!="symbol"?e.setAttribute(n,""):e.removeAttribute(n);break;case"capture":case"download":i===!0?e.setAttribute(n,""):i!==!1&&i!=null&&typeof i!="function"&&typeof i!="symbol"?e.setAttribute(n,i):e.removeAttribute(n);break;case"cols":case"rows":case"size":case"span":i!=null&&typeof i!="function"&&typeof i!="symbol"&&!isNaN(i)&&1<=i?e.setAttribute(n,i):e.removeAttribute(n);break;case"rowSpan":case"start":i==null||typeof i=="function"||typeof i=="symbol"||isNaN(i)?e.removeAttribute(n):e.setAttribute(n,i);break;case"popover":we("beforetoggle",e),we("toggle",e),Eh(e,"popover",i);break;case"xlinkActuate":sa(e,"http://www.w3.org/1999/xlink","xlink:actuate",i);break;case"xlinkArcrole":sa(e,"http://www.w3.org/1999/xlink","xlink:arcrole",i);break;case"xlinkRole":sa(e,"http://www.w3.org/1999/xlink","xlink:role",i);break;case"xlinkShow":sa(e,"http://www.w3.org/1999/xlink","xlink:show",i);break;case"xlinkTitle":sa(e,"http://www.w3.org/1999/xlink","xlink:title",i);break;case"xlinkType":sa(e,"http://www.w3.org/1999/xlink","xlink:type",i);break;case"xmlBase":sa(e,"http://www.w3.org/XML/1998/namespace","xml:base",i);break;case"xmlLang":sa(e,"http://www.w3.org/XML/1998/namespace","xml:lang",i);break;case"xmlSpace":sa(e,"http://www.w3.org/XML/1998/namespace","xml:space",i);break;case"is":Eh(e,"is",i);break;case"innerText":case"textContent":return;default:if(!(2<n.length)||n[0]!=="o"&&n[0]!=="O"||n[1]!=="n"&&n[1]!=="N")n=Pw.get(n)||n,Eh(e,n,i);else return}Ne=!0}function h0(e,t,n,i,s,a){switch(n){case"style":fb(e,i,a);return;case"dangerouslySetInnerHTML":if(i!=null){if(typeof i!="object"||!("__html"in i))throw Error(at(61));if(n=i.__html,n!=null){if(s.children!=null)throw Error(at(60));a?.__html!==n&&(e.innerHTML=n)}}break;case"children":if(typeof i=="string")pl(e,i);else if(typeof i=="number"||typeof i=="bigint")pl(e,""+i);else return;break;case"onScroll":i!=null&&we("scroll",e);return;case"onScrollEnd":i!=null&&we("scrollend",e);return;case"onClick":i!=null&&(e.onclick=Ps);return;case"suppressContentEditableWarning":case"suppressHydrationWarning":case"innerHTML":case"ref":return;case"innerText":case"textContent":return;default:if(!rb.hasOwnProperty(n))t:{if(n[0]==="o"&&n[1]==="n"&&(s=n.endsWith("Capture"),a=n.slice(2,s?n.length-7:void 0),t=e[Ei]||null,t=t!=null?t[n]:null,typeof t=="function"&&e.removeEventListener(a,t,s),typeof i=="function")){typeof t!="function"&&t!==null&&(n in e?e[n]=null:e.hasAttribute(n)&&e.removeAttribute(n)),e.addEventListener(a,i,s);break t}Ne=!0,n in e?e[n]=i:i===!0?e.setAttribute(n,""):Eh(e,n,i)}return}Ne=!0}function qn(e,t,n){switch(t){case"div":case"span":case"svg":case"path":case"a":case"g":case"p":case"li":break;case"img":we("error",e),we("load",e);var i=!1,s=!1,a;for(a in n)if(n.hasOwnProperty(a)){var r=n[a];if(r!=null)switch(a){case"src":i=!0;break;case"srcSet":s=!0;break;case"children":case"dangerouslySetInnerHTML":throw Error(at(137,t));default:Ve(e,t,a,r,n,null)}}s&&Ve(e,t,"srcSet",n.srcSet,n,null),i&&Ve(e,t,"src",n.src,n,null);return;case"input":we("invalid",e);var o=a=r=s=null,l=null,c=null;for(i in n)if(n.hasOwnProperty(i)){var u=n[i];if(u!=null)switch(i){case"name":s=u;break;case"type":r=u;break;case"checked":l=u;break;case"defaultChecked":c=u;break;case"value":a=u;break;case"defaultValue":o=u;break;case"children":case"dangerouslySetInnerHTML":if(u!=null)throw Error(at(137,t));break;default:Ve(e,t,i,u,n,null)}}cb(e,a,o,l,c,r,s,!1);return;case"select":we("invalid",e),i=r=a=null;for(s in n)if(n.hasOwnProperty(s)&&(o=n[s],o!=null))switch(s){case"value":a=o;break;case"defaultValue":r=o;break;case"multiple":i=o;default:Ve(e,t,s,o,n,null)}t=a,n=r,e.multiple=!!i,t!=null?il(e,!!i,t,!1):n!=null&&il(e,!!i,n,!0);return;case"textarea":we("invalid",e),a=s=i=null;for(r in n)if(n.hasOwnProperty(r)&&(o=n[r],o!=null))switch(r){case"value":i=o;break;case"defaultValue":s=o;break;case"children":a=o;break;case"dangerouslySetInnerHTML":if(o!=null)throw Error(at(91));break;default:Ve(e,t,r,o,n,null)}hb(e,i,s,a);return;case"option":for(l in n)n.hasOwnProperty(l)&&(i=n[l],i!=null)&&(l==="selected"?e.selected=i&&typeof i!="function"&&typeof i!="symbol":Ve(e,t,l,i,n,null));return;case"dialog":we("beforetoggle",e),we("toggle",e),we("cancel",e),we("close",e);break;case"iframe":case"object":we("load",e);break;case"video":case"audio":for(i=0;i<au.length;i++)we(au[i],e);break;case"image":we("error",e),we("load",e);break;case"details":we("toggle",e);break;case"embed":case"source":case"link":we("error",e),we("load",e);case"area":case"base":case"br":case"col":case"hr":case"keygen":case"meta":case"param":case"track":case"wbr":case"menuitem":for(c in n)if(n.hasOwnProperty(c)&&(i=n[c],i!=null))switch(c){case"children":case"dangerouslySetInnerHTML":throw Error(at(137,t));default:Ve(e,t,c,i,n,null)}return;default:if(w0(t)){for(u in n)n.hasOwnProperty(u)&&(i=n[u],i!==void 0&&h0(e,t,u,i,n,void 0));return}}for(o in n)n.hasOwnProperty(o)&&(i=n[o],i!=null&&Ve(e,t,o,i,n,null))}var gR={};function vR(e,t,n,i){switch(t){case"div":case"span":case"svg":case"path":case"a":case"g":case"p":case"li":break;case"input":var s=null,a=null,r=null,o=null,l=null,c=null,u=null;for(p in n){var d=n[p];if(n.hasOwnProperty(p)&&d!=null)switch(p){case"checked":break;case"value":break;case"defaultValue":l=d;default:i.hasOwnProperty(p)||Ve(e,t,p,null,i,d)}}for(var h in i){var p=i[h];if(d=n[h],i.hasOwnProperty(h)&&(p!=null||d!=null))switch(h){case"type":p!==d&&(Ne=!0),a=p;break;case"name":p!==d&&(Ne=!0),s=p;break;case"checked":p!==d&&(Ne=!0),c=p;break;case"defaultChecked":p!==d&&(Ne=!0),u=p;break;case"value":p!==d&&(Ne=!0),r=p;break;case"defaultValue":p!==d&&(Ne=!0),o=p;break;case"children":case"dangerouslySetInnerHTML":if(p!=null)throw Error(at(137,t));break;default:p!==d&&Ve(e,t,h,p,i,d)}}Mm(e,r,o,l,c,u,a,s);return;case"select":p=r=o=h=null;for(a in n)if(l=n[a],n.hasOwnProperty(a)&&l!=null)switch(a){case"value":break;case"multiple":p=l;default:i.hasOwnProperty(a)||Ve(e,t,a,null,i,l)}for(s in i)if(a=i[s],l=n[s],i.hasOwnProperty(s)&&(a!=null||l!=null))switch(s){case"value":a!==l&&(Ne=!0),h=a;break;case"defaultValue":a!==l&&(Ne=!0),o=a;break;case"multiple":a!==l&&(Ne=!0),r=a;default:a!==l&&Ve(e,t,s,a,i,l)}t=o,n=r,i=p,h!=null?il(e,!!n,h,!1):!!i!=!!n&&(t!=null?il(e,!!n,t,!0):il(e,!!n,n?[]:"",!1));return;case"textarea":p=h=null;for(o in n)if(s=n[o],n.hasOwnProperty(o)&&s!=null&&!i.hasOwnProperty(o))switch(o){case"value":break;case"children":break;default:Ve(e,t,o,null,i,s)}for(r in i)if(s=i[r],a=n[r],i.hasOwnProperty(r)&&(s!=null||a!=null))switch(r){case"value":s!==a&&(Ne=!0),h=s;break;case"defaultValue":s!==a&&(Ne=!0),p=s;break;case"children":break;case"dangerouslySetInnerHTML":if(s!=null)throw Error(at(91));break;default:s!==a&&Ve(e,t,r,s,i,a)}ub(e,h,p);return;case"option":for(var g in n)h=n[g],n.hasOwnProperty(g)&&h!=null&&!i.hasOwnProperty(g)&&(g==="selected"?e.selected=!1:Ve(e,t,g,null,i,h));for(l in i)h=i[l],p=n[l],i.hasOwnProperty(l)&&h!==p&&(h!=null||p!=null)&&(l==="selected"?(h!==p&&(Ne=!0),e.selected=h&&typeof h!="function"&&typeof h!="symbol"):Ve(e,t,l,h,i,p));return;case"img":case"link":case"area":case"base":case"br":case"col":case"embed":case"hr":case"keygen":case"meta":case"param":case"source":case"track":case"wbr":case"menuitem":for(var S in n)h=n[S],n.hasOwnProperty(S)&&h!=null&&!i.hasOwnProperty(S)&&Ve(e,t,S,null,i,h);for(c in i)if(h=i[c],p=n[c],i.hasOwnProperty(c)&&h!==p&&(h!=null||p!=null))switch(c){case"children":case"dangerouslySetInnerHTML":if(h!=null)throw Error(at(137,t));break;default:Ve(e,t,c,h,i,p)}return;default:if(w0(t)){for(var m in n)h=n[m],n.hasOwnProperty(m)&&h!==void 0&&!i.hasOwnProperty(m)&&h0(e,t,m,void 0,i,h);for(u in i)h=i[u],p=n[u],!i.hasOwnProperty(u)||h===p||h===void 0&&p===void 0||h0(e,t,u,h,i,p);return}}for(var f in n)h=n[f],n.hasOwnProperty(f)&&h!=null&&!i.hasOwnProperty(f)&&Ve(e,t,f,null,i,h);for(d in i)h=i[d],p=n[d],!i.hasOwnProperty(d)||h===p||h==null&&p==null||Ve(e,t,d,h,i,p)}function y1(e){switch(e){case"css":case"script":case"font":case"img":case"image":case"input":case"link":return!0;default:return!1}}function yR(){if(typeof performance.getEntriesByType=="function"){for(var e=0,t=0,n=performance.getEntriesByType("resource"),i=0;i<n.length;i++){var s=n[i],a=s.transferSize,r=s.initiatorType,o=s.duration;if(a&&o&&y1(r)){for(r=0,o=s.responseEnd,i+=1;i<n.length;i++){var l=n[i],c=l.startTime;if(c>o)break;var u=l.transferSize,d=l.initiatorType;u&&y1(d)&&(l=l.responseEnd,r+=u*(l<o?1:(o-c)/(l-c)))}if(--i,t+=8*(a+r)/(s.duration/1e3),e++,10<e)break}}if(0<e)return t/e/1e6}return navigator.connection&&(e=navigator.connection.downlink,typeof e=="number")?e:5}var f0=null,d0=null;function ou(e){return e.nodeType===9?e:e.ownerDocument}function _1(e){switch(e){case"http://www.w3.org/2000/svg":return 1;case"http://www.w3.org/1998/Math/MathML":return 2;default:return 0}}function gM(e,t){if(e===0)switch(t){case"svg":return 1;case"math":return 2;default:return 0}return e===1&&t==="foreignObject"?0:e}function vM(e,t,n,i){return n=ou(n).createElement(e),n[Gn]=i,n[Ei]=t,qn(n,e,t),zn(n),n}function p0(e,t){return e==="textarea"||e==="noscript"||typeof t.children=="string"||typeof t.children=="number"||typeof t.children=="bigint"||typeof t.dangerouslySetInnerHTML=="object"&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var lm=null;function _R(){var e=window.event;return e&&e.type==="popstate"?e===lm?!1:(lm=e,!0):(lm=null,!1)}var dg=typeof setTimeout=="function"?setTimeout:void 0,xR=typeof clearTimeout=="function"?clearTimeout:void 0,x1=typeof Promise=="function"?Promise:void 0,b1=typeof requestAnimationFrame=="function"?requestAnimationFrame:dg,bR=typeof queueMicrotask=="function"?queueMicrotask:typeof x1<"u"?function(e){return x1.resolve(null).then(e).catch(SR)}:dg;function SR(e){setTimeout(function(){throw e})}function mr(e){return e==="head"}function S1(e,t){var n=t,i=0;do{var s=n.nextSibling;if(e.removeChild(n),s&&s.nodeType===8)if(n=s.data,n==="/$"||n==="/&"){if(i===0){e.removeChild(s),El(t);return}i--}else if(n==="$"||n==="$?"||n==="$~"||n==="$!"||n==="&")i++;else if(n==="html")um(e.ownerDocument.documentElement);else if(n==="head"){n=e.ownerDocument.head,um(n);for(var a=n.firstChild;a;){var r=a.nextSibling,o=a.nodeName;a[gu]||o==="SCRIPT"||o==="STYLE"||o==="LINK"&&a.rel.toLowerCase()==="stylesheet"||n.removeChild(a),a=r}}else n==="body"&&um(e.ownerDocument.body);n=s}while(n);El(t)}function M1(e,t){var n=e;e=0;do{var i=n.nextSibling;if(n.nodeType===1?t?(n._stashedDisplay=n.style.display,n.style.display="none"):(n.style.display=n._stashedDisplay||"",n.getAttribute("style")===""&&n.removeAttribute("style")):n.nodeType===3&&(t?(n._stashedText=n.nodeValue,n.nodeValue=""):n.nodeValue=n._stashedText||""),i&&i.nodeType===8)if(n=i.data,n==="/$"){if(e===0)break;e--}else n!=="$"&&n!=="$?"&&n!=="$~"&&n!=="$!"||e++;n=i}while(n)}function yM(e,t,n){if(t=CSS.escape(t)!==t?"r-"+btoa(t).replace(/=/g,""):t,e.style.viewTransitionName=t,n!=null&&(e.style.viewTransitionClass=n),n=getComputedStyle(e),n.display==="inline"){if(t=e.getClientRects(),t.length===1)var i=1;else for(var s=i=0;s<t.length;s++){var a=t[s];0<a.width&&0<a.height&&i++}i===1&&(e=e.style,e.display=t.length===1?"inline-block":"block",e.marginTop="-"+n.paddingTop,e.marginBottom="-"+n.paddingBottom)}}function _M(e,t){e=e.style,t=t.style;var n=t!=null?t.hasOwnProperty("viewTransitionName")?t.viewTransitionName:t.hasOwnProperty("view-transition-name")?t["view-transition-name"]:null:null;e.viewTransitionName=n==null||typeof n=="boolean"?"":(""+n).trim(),n=t!=null?t.hasOwnProperty("viewTransitionClass")?t.viewTransitionClass:t.hasOwnProperty("view-transition-class")?t["view-transition-class"]:null:null,e.viewTransitionClass=n==null||typeof n=="boolean"?"":(""+n).trim(),e.display==="inline-block"&&(t==null?e.display=e.margin="":(n=t.display,e.display=n==null||typeof n=="boolean"?"":n,n=t.margin,n!=null?e.margin=n:(n=t.hasOwnProperty("marginTop")?t.marginTop:t["margin-top"],e.marginTop=n==null||typeof n=="boolean"?"":n,t=t.hasOwnProperty("marginBottom")?t.marginBottom:t["margin-bottom"],e.marginBottom=t==null||typeof t=="boolean"?"":t)))}function xM(e,t,n){return n=n.ownerDocument.defaultView,{rect:e,abs:t.position==="absolute"||t.position==="fixed",clip:t.clipPath!=="none"||t.overflow!=="visible"||t.filter!=="none"||t.mask!=="none"||t.mask!=="none"||t.borderRadius!=="0px",view:0<=e.bottom&&0<=e.right&&e.top<=n.innerHeight&&e.left<=n.innerWidth}}function m0(e){var t=e.getBoundingClientRect(),n=getComputedStyle(e);return xM(t,n,e)}function MR(e){var t=e.getBoundingClientRect();t=new DOMRect(t.x+2e4,t.y+2e4,t.width,t.height);var n=getComputedStyle(e);return xM(t,n,e)}function ER(e){return e.documentElement.clientHeight}function TR(e){this.addEventListener("load",e),this.addEventListener("error",e)}function AR(e,t,n,i,s,a,r,o,l){var c=t.nodeType===9?t:t.ownerDocument;try{var u=c.startViewTransition({update:function(){var h=c.defaultView,p=h.navigation&&h.navigation.transition,g=c.fonts.status;i();var S=[];if(g==="loaded"&&(ER(c),c.fonts.status==="loading"&&S.push(c.fonts.ready)),g=S.length,e!==null)for(var m=e.suspenseyImages,f=0,y=0;y<m.length;y++){var _=m[y];if(!_.complete){var b=_.getBoundingClientRect();if(0<b.bottom&&0<b.right&&b.top<h.innerHeight&&b.left<h.innerWidth){if(f+=UM(_),f>Hh){S.length=g;break}_=new Promise(TR.bind(_)),S.push(_)}}}if(0<S.length)return h=Promise.race([Promise.all(S),new Promise(function(D){return setTimeout(D,500)})]).then(s,s),(p?Promise.allSettled([p.finished,h]):h).then(a,a);if(s(),p)return p.finished.then(a,a);a()},types:n});c.__reactViewTransition=u;var d=[];return u.ready.then(function(){for(var h=c.documentElement.getAnimations({subtree:!0}),p=0;p<h.length;p++){var g=h[p],S=g.effect,m=S.pseudoElement;if(m!=null&&m.startsWith("::view-transition")){d.push(g),g=S.getKeyframes();for(var f=m=void 0,y=!0,_=0;_<g.length;_++){var b=g[_],D=b.width;if(m===void 0)m=D;else if(m!==D){y=!1;break}if(D=b.height,f===void 0)f=D;else if(f!==D){y=!1;break}delete b.width,delete b.height,b.transform==="none"&&delete b.transform}y&&m!==void 0&&f!==void 0&&(S.setKeyframes(g),y=getComputedStyle(S.target,S.pseudoElement),y.width!==m||y.height!==f)&&(y=g[0],y.width=m,y.height=f,y=g[g.length-1],y.width=m,y.height=f,S.setKeyframes(g))}}r()},function(h){c.__reactViewTransition===u&&(c.__reactViewTransition=null);try{typeof h=="object"&&h!==null&&h.name==="InvalidStateError"&&(h.message==="View transition was skipped because document visibility state is hidden."||h.message==="Skipping view transition because document visibility state has become hidden."||h.message==="Skipping view transition because viewport size changed."||h.message==="Transition was aborted because of invalid state")&&(h=null),h!==null&&l(h)}finally{i(),s(),r()}}),u.finished.finally(function(){for(var h=0;h<d.length;h++)d[h].cancel();c.__reactViewTransition===u&&(c.__reactViewTransition=null),o()}),u}catch{return i(),s(),r(),null}}function Or(e,t){this._scope=document.documentElement,this._selector="::view-transition-"+e+"("+t+")"}Or.prototype.animate=function(e,t){return t=typeof t=="number"?{duration:t}:je({},t),t.pseudoElement=this._selector,this._scope.animate(e,t)};Or.prototype.getAnimations=function(){for(var e=this._scope,t=this._selector,n=e.getAnimations({subtree:!0}),i=[],s=0;s<n.length;s++){var a=n[s].effect;a!==null&&a.target===e&&a.pseudoElement===t&&i.push(n[s])}return i};Or.prototype.getComputedStyle=function(){return getComputedStyle(this._scope,this._selector)};function bM(e){return{name:e,group:new Or("group",e),imagePair:new Or("image-pair",e),old:new Or("old",e),new:new Or("new",e)}}function Fi(e){this._fragmentFiber=e,this._observers=this._eventListeners=null}Fi.prototype.addEventListener=function(e,t,n){var i=null,s=null;if(!(n!=null&&typeof n!="boolean"&&(i=n.signal||null,i!==null&&i.aborted))){this._eventListeners===null&&(this._eventListeners=[]);var a=this._eventListeners;if(SM(a,e,t,n)===-1){var r=this,o=t;n!=null&&typeof n!="boolean"&&n.once===!0&&(o=function(l){r.removeEventListener(e,t,n),typeof t=="function"?t.call(this,l):t.handleEvent(l)}),i!==null&&(s=r.removeEventListener.bind(r,e,t,n),i.addEventListener("abort",s,{once:!0}),s=i.removeEventListener.bind(i,"abort",s)),i=xl(n),a.push({type:e,listener:t,optionsOrUseCapture:n,attachedListener:o,cleanup:s}),Mi(this._fragmentFiber.child,!1,wR,e,o,i)}this._eventListeners=a}};function wR(e,t,n,i){return An(e).addEventListener(t,n,i),!1}Fi.prototype.removeEventListener=function(e,t,n){var i=this._eventListeners;if(i!==null&&(t=SM(i,e,t,n),t!==-1)){var s=i[t];n=s.attachedListener;var a=s.cleanup;s=xl(s.optionsOrUseCapture),Mi(this._fragmentFiber.child,!1,RR,e,n,s),i.splice(t,1),a!==null&&a()}};function RR(e,t,n,i){return An(e).removeEventListener(t,n,i),!1}function xl(e){return e!=null&&typeof e!="boolean"&&(e.once===!0||e.signal instanceof AbortSignal)?{capture:e.capture,passive:e.passive}:e}function E1(e){return e==null?"c=0":typeof e=="boolean"?"c="+(e?"1":"0"):"c="+(e.capture?"1":"0")}function SM(e,t,n,i){if(e.length===0)return-1;i=E1(i);for(var s=0;s<e.length;s++){var a=e[s];if(a.type===t&&a.listener===n&&E1(a.optionsOrUseCapture)===i)return s}return-1}Fi.prototype.dispatchEvent=function(e){var t=Zr(this._fragmentFiber);if(t===null)return!0;t=An(t);var n=this._eventListeners;if(n!==null&&0<n.length||!e.bubbles){var i=t.nodeType===9?t.createComment(""):document.createTextNode("");if(n)for(var s=0;s<n.length;s++){var a=n[s];i.addEventListener(a.type,a.attachedListener,xl(a.optionsOrUseCapture))}if(t.appendChild(i),e=i.dispatchEvent(e),n)for(s=0;s<n.length;s++)a=n[s],i.removeEventListener(a.type,a.attachedListener,xl(a.optionsOrUseCapture));return t.removeChild(i),e}return t.dispatchEvent(e)};Fi.prototype.focus=function(e){Mi(this._fragmentFiber.child,!0,MM,e,void 0,void 0)};function MM(e,t){return e.tag===6?!1:(e=An(e),HR(e,t))}Fi.prototype.focusLast=function(e){var t=[];Mi(this._fragmentFiber.child,!0,pg,t,void 0,void 0);for(var n=t.length-1;0<=n&&!MM(t[n],e);n--);};function pg(e,t){return t.push(e),!1}Fi.prototype.blur=function(){var e=Zr(this._fragmentFiber);e!==null&&(e=An(e),e=ou(e).activeElement,e!==null&&Mi(this._fragmentFiber.child,!1,CR,e,void 0,void 0))};function CR(e,t){return e.tag===6?!1:(e=An(e),e===t||e.contains(t)?(t.blur(),!0):!1)}Fi.prototype.observeUsing=function(e){this._observers===null&&(this._observers=new Set),this._observers.add(e),Mi(this._fragmentFiber.child,!1,DR,e,void 0,void 0)};function DR(e,t){return e.tag===6||(e=An(e),t.observe(e)),!1}Fi.prototype.unobserveUsing=function(e){var t=this._observers;if(t!==null&&t.has(e)){t.delete(e),Mi(this._fragmentFiber.child,!1,NR,e,void 0,void 0);for(var n=t=0;n<fs.length;n++){var i=fs[n];i.fragmentInstance===this&&i.observer===e?e.unobserve(i.instance):fs[t++]=i}fs.length=t}};function NR(e,t){return e.tag===6||(e=An(e),t.unobserve(e)),!1}var fs=[],cm=!1;function UR(e,t,n){fs.push({fragmentInstance:e,observer:t,instance:n}),cm||(cm=!0,VR(function(){cm=!1;var i=fs;fs=[];for(var s=0;s<i.length;s++){var a=i[s];a.observer.unobserve(a.instance)}}))}Fi.prototype.getClientRects=function(){var e=[];return Mi(this._fragmentFiber.child,!1,LR,e,void 0,void 0),e};function LR(e,t){if(e.tag===6){e=e.stateNode;var n=e.ownerDocument.createRange();n.selectNodeContents(e),t.push.apply(t,n.getClientRects())}else e=An(e),t.push.apply(t,e.getClientRects());return!1}Fi.prototype.getRootNode=function(e){var t=Zr(this._fragmentFiber);return t===null?this:An(t).getRootNode(e)};Fi.prototype.compareDocumentPosition=function(e){var t=Zr(this._fragmentFiber);if(t===null)return Node.DOCUMENT_POSITION_DISCONNECTED;var n=[];Mi(this._fragmentFiber.child,!1,pg,n,void 0,void 0);var i=An(t);if(n.length===0){if(n=i,ix(this._fragmentFiber)){t:{for(t=this._fragmentFiber.return;t!==null;){if(t.tag===4){t=t.stateNode.containerInfo;break t}if(t.tag===3||t.tag===5||t.tag===27)break;t=t.return}t=null}t!=null&&(n=t)}t=this._fragmentFiber;var s=i=n.compareDocumentPosition(e);return n===e?s=Node.DOCUMENT_POSITION_CONTAINS:i&Node.DOCUMENT_POSITION_CONTAINED_BY&&(n=W1(t)[1],n===null?s=Node.DOCUMENT_POSITION_PRECEDING:(e=An(n).compareDocumentPosition(e),s=e===0||e&Node.DOCUMENT_POSITION_FOLLOWING?Node.DOCUMENT_POSITION_FOLLOWING:Node.DOCUMENT_POSITION_PRECEDING)),s|=Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC}t=An(n[0]),s=An(n[n.length-1]);var a=ix(this._fragmentFiber)?t.parentElement:i;if(a==null)return Node.DOCUMENT_POSITION_DISCONNECTED;i=a.compareDocumentPosition(t)&Node.DOCUMENT_POSITION_CONTAINED_BY,a=a.compareDocumentPosition(s)&Node.DOCUMENT_POSITION_CONTAINED_BY;var r=t.compareDocumentPosition(e),o=s.compareDocumentPosition(e),l=r&Node.DOCUMENT_POSITION_CONTAINED_BY||o&Node.DOCUMENT_POSITION_CONTAINED_BY;return o=i&&a&&r&Node.DOCUMENT_POSITION_FOLLOWING&&o&Node.DOCUMENT_POSITION_PRECEDING,t=i&&t===e||a&&s===e||l||o?Node.DOCUMENT_POSITION_CONTAINED_BY:!i&&t===e||!a&&s===e?Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC:r,t&Node.DOCUMENT_POSITION_DISCONNECTED||t&Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC||OR(t,this._fragmentFiber,n[0],n[n.length-1],e)?t:Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC};function OR(e,t,n,i,s){var a=Lr(s);if(e&Node.DOCUMENT_POSITION_CONTAINED_BY){if(n=!!a)t:{for(;a!==null;){if(a.tag===7&&(a===t||a.alternate===t)){n=!0;break t}a=a.return}n=!1}return n}if(e&Node.DOCUMENT_POSITION_CONTAINS){if(a===null)return a=s.ownerDocument,s===a||s===a.documentElement||s===a.body;t:{for(a=t,t=Zr(t);a!==null;){if(!(a.tag!==5&&a.tag!==3&&a.tag!==27||a!==t&&a.alternate!==t)){a=!0;break t}a=a.return}a=!1}return a}return e&Node.DOCUMENT_POSITION_PRECEDING?((t=!!a)&&!(t=a===n)&&(t=fm(n,a,sx),t===null?t=!1:(Mi(t,!0,uw,a,n),a=Xo,Xo=null,t=a!==null)),t):e&Node.DOCUMENT_POSITION_FOLLOWING?((t=!!a)&&!(t=a===i)&&(t=fm(i,a,sx),t===null?t=!1:(Mi(t,!0,hw,a,i),a=Xo,hm=Xo=null,t=a!==null)),t):!1}function T1(e,t){var n=e.ownerDocument.createRange();n.selectNodeContents(e),e=n.getBoundingClientRect(),window.scrollTo(window.scrollX+e.left,t?window.scrollY+e.top:window.scrollY+e.bottom-window.innerHeight)}Fi.prototype.scrollIntoView=function(e){if(typeof e=="object")throw Error(at(566));var t=[];Mi(this._fragmentFiber.child,!1,pg,t,void 0,void 0);var n=e!==!1;if(t.length===0){var i=W1(this._fragmentFiber);if(i=n?i[1]||i[0]||Zr(this._fragmentFiber):i[0]||i[1],i===null)return;if(i.tag===6){e=An(i),T1(e,n);return}if(i=An(i),i.nodeType!==9){if(i.nodeType===11){n="host"in i?i.host:null,n!==null&&n.scrollIntoView(e);return}i.scrollIntoView(e)}}for(i=n?t.length-1:0;i!==(n?-1:t.length);){var s=t[i];s.tag===6?(s=An(s),T1(s,n)):An(s).scrollIntoView(e),i+=n?-1:1}};function IR(e,t){return e=An(e),EM(e,t),!1}function EM(e,t){e.reactFragments==null&&(e.reactFragments=new Set),e.reactFragments.add(t)}function TM(e,t){var n=t._eventListeners;if(n!==null)for(var i=0;i<n.length;i++){var s=n[i];e.addEventListener(s.type,s.attachedListener,xl(s.optionsOrUseCapture))}e.nodeType!==3&&(n=t._observers,n!==null&&n.forEach(function(a){for(var r=0,o=0;o<fs.length;o++){var l=fs[o];(l.fragmentInstance!==t||l.observer!==a||l.instance!==e)&&(fs[r++]=l)}fs.length=r,a.observe(e)}),EM(e,t))}function PR(e,t){var n=t._eventListeners;if(n!==null)for(var i=0;i<n.length;i++){var s=n[i];e.removeEventListener(s.type,s.attachedListener,xl(s.optionsOrUseCapture))}e.nodeType!==3&&(n=t._observers,n!==null&&n.forEach(function(a){typeof a.rootMargin=="string"?UR(t,a,e):a.unobserve(e)}),e.reactFragments!=null&&e.reactFragments.delete(t))}function g0(e){var t=e.firstChild;for(t&&t.nodeType===10&&(t=t.nextSibling);t;){var n=t;switch(t=t.nextSibling,n.nodeName){case"HTML":case"HEAD":case"BODY":g0(n),xf(n);continue;case"SCRIPT":case"STYLE":continue;case"LINK":if(n.rel.toLowerCase()==="stylesheet")continue}e.removeChild(n)}}function zR(e,t,n,i){for(;e.nodeType===1;){var s=n;if(e.nodeName.toLowerCase()!==t.toLowerCase()){if(!i&&(e.nodeName!=="INPUT"||e.type!=="hidden"))break}else if(i){if(!e[gu])switch(t){case"meta":if(!e.hasAttribute("itemprop"))break;return e;case"link":if(a=e.getAttribute("rel"),a==="stylesheet"&&e.hasAttribute("data-precedence"))break;if(a!==s.rel||e.getAttribute("href")!==(s.href==null||s.href===""?null:s.href)||e.getAttribute("crossorigin")!==(s.crossOrigin==null?null:s.crossOrigin)||e.getAttribute("title")!==(s.title==null?null:s.title))break;return e;case"style":if(e.hasAttribute("data-precedence"))break;return e;case"script":if(a=e.getAttribute("src"),(a!==(s.src==null?null:s.src)||e.getAttribute("type")!==(s.type==null?null:s.type)||e.getAttribute("crossorigin")!==(s.crossOrigin==null?null:s.crossOrigin))&&a&&e.hasAttribute("async")&&!e.hasAttribute("itemprop"))break;return e;default:return e}}else if(t==="input"&&e.type==="hidden"){var a=s.name==null?null:""+s.name;if(s.type==="hidden"&&e.getAttribute("name")===a)return e}else return e;if(e=ts(e.nextSibling),e===null)break}return null}function BR(e,t,n){if(t==="")return null;for(;e.nodeType!==3;)if((e.nodeType!==1||e.nodeName!=="INPUT"||e.type!=="hidden")&&!n||(e=ts(e.nextSibling),e===null))return null;return e}function AM(e,t){for(;e.nodeType!==8;)if((e.nodeType!==1||e.nodeName!=="INPUT"||e.type!=="hidden")&&!t||(e=ts(e.nextSibling),e===null))return null;return e}function v0(e){return e.data==="$?"||e.data==="$~"}function mg(e){return e.data==="$!"||e.data==="$?"&&e.ownerDocument.readyState!=="loading"}function FR(e,t){var n=e.ownerDocument;if(e.data==="$~")e._reactRetry=t;else if(e.data!=="$?"||n.readyState!=="loading")t();else{var i=function(){t(),n.removeEventListener("DOMContentLoaded",i)};n.addEventListener("DOMContentLoaded",i),e._reactRetry=i}}function ts(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t==="$"||t==="$!"||t==="$?"||t==="$~"||t==="&"||t==="F!"||t==="F")break;if(t==="/$"||t==="/&")return null}}return e}var y0=null;function A1(e){e=e.nextSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="/$"||n==="/&"){if(t===0)return ts(e.nextSibling);t--}else n!=="$"&&n!=="$!"&&n!=="$?"&&n!=="$~"&&n!=="&"||t++}e=e.nextSibling}return null}function w1(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="$"||n==="$!"||n==="$?"||n==="$~"||n==="&"){if(t===0)return e;t--}else n!=="/$"&&n!=="/&"||t++}e=e.previousSibling}return null}function HR(e,t){function n(){i=!0}if(e.ownerDocument.activeElement===e)return!0;var i=!1;try{e.ownerDocument.addEventListener("focus",n,!0),(e.focus||HTMLElement.prototype.focus).call(e,t)}finally{e.ownerDocument.removeEventListener("focus",n,!0)}return i}function VR(e){b1(function(){b1(function(t){return e(t)})})}function wM(e,t,n){switch(t=ou(n),e){case"html":if(e=t.documentElement,!e)throw Error(at(452));return e;case"head":if(e=t.head,!e)throw Error(at(453));return e;case"body":if(e=t.body,!e)throw Error(at(454));return e;default:throw Error(at(451))}}function RM(e,t,n){for(var i in n){var s=n[i];n.hasOwnProperty(i)&&s!=null&&Ve(e,t,i,null,gR,s)}n.dangerouslySetInnerHTML!=null&&(e.textContent=""),e.onclick===Ps&&(e.onclick=null),xf(e)}function um(e){for(var t=e.attributes;t.length;)e.removeAttributeNode(t[0]);xf(e)}var es=new Map,R1=new Set;function lu(e){if(typeof e.getRootNode=="function"){var t=e.getRootNode();if(t.nodeType===9||t.nodeType===11)return t}return e.nodeType===9?e:e.ownerDocument}var ya=Le.d;Le.d={f:GR,r:kR,D:XR,C:WR,L:qR,m:YR,X:KR,S:ZR,M:jR};function GR(){var e=ya.f(),t=Of();return e||t}function kR(e){var t=Al(e);t!==null&&t.tag===5&&t.type==="form"?fS(t):ya.r(e)}var Dl=typeof document>"u"?null:document;function CM(e,t,n){var i=Dl;if(i&&typeof t=="string"&&t){var s=Qi(t);s='link[rel="'+e+'"][href="'+s+'"]',typeof n=="string"&&(s+='[crossorigin="'+n+'"]'),R1.has(s)||(R1.add(s),e={rel:e,crossOrigin:n,href:t},i.querySelector(s)===null&&(t=i.createElement("link"),qn(t,"link",e),zn(t),i.head.appendChild(t)))}}function XR(e){ya.D(e),CM("dns-prefetch",e,null)}function WR(e,t){ya.C(e,t),CM("preconnect",e,t)}function qR(e,t,n){ya.L(e,t,n);var i=Dl;if(i&&e&&t){var s='link[rel="preload"][as="'+Qi(t)+'"]';t==="image"&&n&&n.imageSrcSet?(s+='[imagesrcset="'+Qi(n.imageSrcSet)+'"]',typeof n.imageSizes=="string"&&(s+='[imagesizes="'+Qi(n.imageSizes)+'"]')):s+='[href="'+Qi(e)+'"]';var a=s;switch(t){case"style":a=bl(e);break;case"script":a=Nl(e)}if(!(es.has(a)||(e=je({rel:"preload",href:t==="image"&&n&&n.imageSrcSet?void 0:e,as:t},n),es.set(a,e),i.querySelector(s)!==null||t==="style"&&i.querySelector(Su(a))||t==="script"&&i.querySelector(Mu(a))))){var r=i.createElement("link");qn(r,"link",e),t==="style"&&(r[Yh]=!0,r.onload=r.onerror=function(){sb(r)}),zn(r),i.head.appendChild(r)}}}function YR(e,t){ya.m(e,t);var n=Dl;if(n&&e){var i=t&&typeof t.as=="string"?t.as:"script",s='link[rel="modulepreload"][as="'+Qi(i)+'"][href="'+Qi(e)+'"]',a=s;switch(i){case"audioworklet":case"paintworklet":case"serviceworker":case"sharedworker":case"worker":case"script":a=Nl(e)}if(!es.has(a)&&(e=je({rel:"modulepreload",href:e},t),es.set(a,e),n.querySelector(s)===null)){switch(i){case"audioworklet":case"paintworklet":case"serviceworker":case"sharedworker":case"worker":case"script":if(n.querySelector(Mu(a)))return}i=n.createElement("link"),qn(i,"link",e),zn(i),n.head.appendChild(i)}}}function ZR(e,t,n){ya.S(e,t,n);var i=Dl;if(i&&e){var s=nl(i).hoistableStyles,a=bl(e);t=t||"default";var r=s.get(a);if(!r){var o={loading:0,preload:null};if(r=i.querySelector(Su(a)))o.loading=5;else{e=je({rel:"stylesheet",href:e,"data-precedence":t},n),(n=es.get(a))&&gg(e,n);var l=r=i.createElement("link");zn(l),qn(l,"link",e),l._p=new Promise(function(c,u){l.onload=c,l.onerror=u}),l.addEventListener("load",function(){o.loading|=1}),l.addEventListener("error",function(){o.loading|=2}),o.loading|=4,Bh(r,t,i)}r={type:"stylesheet",instance:r,count:1,state:o},s.set(a,r)}}}function KR(e,t){ya.X(e,t);var n=Dl;if(n&&e){var i=nl(n).hoistableScripts,s=Nl(e),a=i.get(s);a||(a=n.querySelector(Mu(s)),a||(e=je({src:e,async:!0},t),(t=es.get(s))&&vg(e,t),a=n.createElement("script"),zn(a),qn(a,"link",e),n.head.appendChild(a)),a={type:"script",instance:a,count:1,state:null},i.set(s,a))}}function jR(e,t){ya.M(e,t);var n=Dl;if(n&&e){var i=nl(n).hoistableScripts,s=Nl(e),a=i.get(s);a||(a=n.querySelector(Mu(s)),a||(e=je({src:e,async:!0,type:"module"},t),(t=es.get(s))&&vg(e,t),a=n.createElement("script"),zn(a),qn(a,"link",e),n.head.appendChild(a)),a={type:"script",instance:a,count:1,state:null},i.set(s,a))}}function C1(e,t,n,i){var s=(s=$a.current)?lu(s):null;if(!s)throw Error(at(446));switch(e){case"meta":case"title":return null;case"style":return typeof n.precedence=="string"&&typeof n.href=="string"?(n=bl(n.href),t=nl(s).hoistableStyles,i=t.get(n),i||(i={type:"style",instance:null,count:0,state:null},t.set(n,i)),i):{type:"void",instance:null,count:0,state:null};case"link":if(n.rel==="stylesheet"&&typeof n.href=="string"&&typeof n.precedence=="string"){e=bl(n.href);var a=nl(s).hoistableStyles,r=a.get(e);if(r||(s=s.ownerDocument||s,r={type:"stylesheet",instance:null,count:0,state:{loading:0,preload:null}},a.set(e,r),(a=s.querySelector(Su(e)))?a._p||(r.instance=a,r.state.loading=5):(a=es.get(e),a||(a={rel:"preload",as:"style",href:n.href,crossOrigin:n.crossOrigin,integrity:n.integrity,media:n.media,hrefLang:n.hrefLang,referrerPolicy:n.referrerPolicy},es.set(e,a)),QR(s,e,a,r.state))),t&&i===null)throw Error(at(528,""));return r}if(t&&i!==null)throw Error(at(529,""));return null;case"script":return t=n.async,n=n.src,typeof n=="string"&&t&&typeof t!="function"&&typeof t!="symbol"?(n=Nl(n),t=nl(s).hoistableScripts,i=t.get(n),i||(i={type:"script",instance:null,count:0,state:null},t.set(n,i)),i):{type:"void",instance:null,count:0,state:null};default:throw Error(at(444,e))}}function bl(e){return'href="'+Qi(e)+'"'}function Su(e){return'link[rel="stylesheet"]['+e+"]"}function DM(e){return je({},e,{"data-precedence":e.precedence,precedence:null})}function QR(e,t,n,i){if(t=e.querySelector('link[rel="preload"][as="style"]['+t+"]")){if(t[Yh]!==!0){i.loading=1;return}}else t=e.createElement("link"),t[Yh]=!0,t.onload=t.onerror=sb.bind(null,t),qn(t,"link",n),zn(t),e.head.appendChild(t);i.preload=t,t.addEventListener("load",function(){return i.loading|=1}),t.addEventListener("error",function(){return i.loading|=2})}function Nl(e){return'[src="'+Qi(e)+'"]'}function Mu(e){return"script[async]"+e}function D1(e,t,n){if(t.count++,t.instance===null)switch(t.type){case"style":var i=e.querySelector('style[data-href~="'+Qi(n.href)+'"]');if(i)return t.instance=i,zn(i),i;var s=je({},n,{"data-href":n.href,"data-precedence":n.precedence,href:null,precedence:null});return i=(e.ownerDocument||e).createElement("style"),zn(i),qn(i,"style",s),Bh(i,n.precedence,e),t.instance=i;case"stylesheet":s=bl(n.href);var a=e.querySelector(Su(s));if(a)return t.state.loading|=4,t.instance=a,zn(a),a;i=DM(n),(s=es.get(s))&&gg(i,s),a=(e.ownerDocument||e).createElement("link"),zn(a);var r=a;return r._p=new Promise(function(o,l){r.onload=o,r.onerror=l}),qn(a,"link",i),t.state.loading|=4,Bh(a,n.precedence,e),t.instance=a;case"script":return a=Nl(n.src),(s=e.querySelector(Mu(a)))?(t.instance=s,zn(s),s):(i=n,(s=es.get(a))&&(i=je({},n),vg(i,s)),e=e.ownerDocument||e,s=e.createElement("script"),zn(s),qn(s,"link",i),e.head.appendChild(s),t.instance=s);case"void":return null;default:throw Error(at(443,t.type))}else t.type==="stylesheet"&&(t.state.loading&4)===0&&(i=t.instance,t.state.loading|=4,Bh(i,n.precedence,e));return t.instance}function Bh(e,t,n){for(var i=n.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'),s=i.length?i[i.length-1]:null,a=s,r=0;r<i.length;r++){var o=i[r];if(o.dataset.precedence===t)a=o;else if(a!==s)break}a?a.parentNode.insertBefore(e,a.nextSibling):(t=n.nodeType===9?n.head:n,t.insertBefore(e,t.firstChild))}function gg(e,t){e.crossOrigin==null&&(e.crossOrigin=t.crossOrigin),e.referrerPolicy==null&&(e.referrerPolicy=t.referrerPolicy),e.title==null&&(e.title=t.title)}function vg(e,t){e.crossOrigin==null&&(e.crossOrigin=t.crossOrigin),e.referrerPolicy==null&&(e.referrerPolicy=t.referrerPolicy),e.integrity==null&&(e.integrity=t.integrity)}var Fh=null;function N1(e,t,n){if(Fh===null){var i=new Map,s=Fh=new Map;s.set(n,i)}else s=Fh,i=s.get(n),i||(i=new Map,s.set(n,i));if(i.has(e))return i;for(i.set(e,null),n=n.getElementsByTagName(e),s=0;s<n.length;s++){var a=n[s];if(!(a[gu]||a[Gn]||e==="link"&&a.getAttribute("rel")==="stylesheet")&&a.namespaceURI!=="http://www.w3.org/2000/svg"){var r=a.getAttribute(t)||"";r=e+r;var o=i.get(r);o?o.push(a):i.set(r,[a])}}return i}function _0(e,t,n){e=e.ownerDocument||e,e.head.insertBefore(n,t==="title"?e.querySelector("head > title"):null)}function JR(e,t,n){if(n===1||t.itemProp!=null)return!1;switch(e){case"meta":case"title":return!0;case"style":if(typeof t.precedence!="string"||typeof t.href!="string"||t.href==="")break;return!0;case"link":if(typeof t.rel!="string"||typeof t.href!="string"||t.href===""||t.onLoad||t.onError)break;return t.rel==="stylesheet"?(e=t.disabled,typeof t.precedence=="string"&&e==null):!0;case"script":if(t.async&&typeof t.async!="function"&&typeof t.async!="symbol"&&!t.onLoad&&!t.onError&&t.src&&typeof t.src=="string")return!0}return!1}function U1(e,t){return e==="img"&&t.src!=null&&t.src!==""&&t.onLoad==null&&t.loading!=="lazy"}function NM(e){return!(e.type==="stylesheet"&&(e.state.loading&3)===0)}function UM(e){return(e.width||100)*(e.height||100)*(typeof devicePixelRatio=="number"?devicePixelRatio:1)*.25}function L1(e,t){typeof t.decode=="function"&&(e.imgCount++,t.complete||(e.imgBytes+=UM(t),e.suspenseyImages.push(t)),e=eC.bind(e),t.decode().then(e,e))}function $R(e,t,n,i){if(n.type==="stylesheet"&&(typeof i.media!="string"||matchMedia(i.media).matches!==!1)&&(n.state.loading&4)===0){if(n.instance===null){var s=bl(i.href),a=t.querySelector(Su(s));if(a){t=a._p,t!==null&&typeof t=="object"&&typeof t.then=="function"&&(e.count++,e=cu.bind(e),t.then(e,e)),n.state.loading|=4,n.instance=a,zn(a);return}a=t.ownerDocument||t,i=DM(i),(s=es.get(s))&&gg(i,s),a=a.createElement("link"),zn(a);var r=a;r._p=new Promise(function(o,l){r.onload=o,r.onerror=l}),qn(a,"link",i),n.instance=a}e.stylesheets===null&&(e.stylesheets=new Map),e.stylesheets.set(n,t),(t=n.state.preload)&&(n.state.loading&3)===0&&(e.count++,n=cu.bind(e),t.addEventListener("load",n),t.addEventListener("error",n))}}var Hh=0;function tC(e,t){return e.stylesheets&&e.count===0&&Vh(e,e.stylesheets),0<e.count||0<e.imgCount?function(n){var i=setTimeout(function(){if(e.stylesheets&&Vh(e,e.stylesheets),e.unsuspend){var a=e.unsuspend;e.unsuspend=null,a()}},6e4+t);0<e.imgBytes&&Hh===0&&(Hh=62500*yR());var s=setTimeout(function(){if(e.waitingForImages=!1,e.count===0&&(e.stylesheets&&Vh(e,e.stylesheets),e.unsuspend)){var a=e.unsuspend;e.unsuspend=null,a()}},(e.imgBytes>Hh?50:800)+t);return e.unsuspend=n,function(){e.unsuspend=null,clearTimeout(i),clearTimeout(s)}}:null}function LM(e){if(e.count===0&&(e.imgCount===0||!e.waitingForImages)){if(e.stylesheets)Vh(e,e.stylesheets);else if(e.unsuspend){var t=e.unsuspend;e.unsuspend=null,t()}}}function cu(){this.count--,LM(this)}function eC(){this.imgCount--,LM(this)}var vf=null;function Vh(e,t){e.stylesheets=null,e.unsuspend!==null&&(e.count++,vf=new Map,t.forEach(nC,e),vf=null,cu.call(e))}function nC(e,t){if(!(t.state.loading&4)){var n=vf.get(e);if(n)var i=n.get(null);else{n=new Map,vf.set(e,n);for(var s=e.querySelectorAll("link[data-precedence],style[data-precedence]"),a=0;a<s.length;a++){var r=s[a];(r.nodeName==="LINK"||r.getAttribute("media")!=="not all")&&(n.set(r.dataset.precedence,r),i=r)}i&&n.set(null,i)}s=t.instance,r=s.getAttribute("data-precedence"),a=n.get(r)||i,a===i&&n.set(null,s),n.set(r,s),this.count++,i=cu.bind(this),s.addEventListener("load",i),s.addEventListener("error",i),a?a.parentNode.insertBefore(s,a.nextSibling):(e=e.nodeType===9?e.head:e,e.insertBefore(s,e.firstChild)),t.state.loading|=4}}var Sl={$$typeof:Is,Provider:null,Consumer:null,_currentValue:Ir,_currentValue2:Ir,_threadCount:0};function iC(e,t,n,i,s,a,r,o,l){this.tag=1,this.containerInfo=e,this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.next=this.pendingContext=this.context=this.cancelPendingCommit=null,this.callbackPriority=0,this.expirationTimes=Bp(-1),this.entangledLanes=this.shellSuspendCounter=this.errorRecoveryDisabledLanes=this.expiredLanes=this.warmLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=Bp(0),this.hiddenUpdates=Bp(null),this.identifierPrefix=i,this.onUncaughtError=s,this.onCaughtError=a,this.onRecoverableError=r,this.pooledCache=null,this.pooledCacheLanes=0,this.formState=l,this.transitionTypes=null,this.incompleteTransitions=new Map}function OM(e,t,n,i,s,a,r,o,l,c,u,d){return e=new iC(e,t,n,r,l,c,u,d,o),t=1,a===!0&&(t|=24),a=bi(3,null,null,t),e.current=a,a.stateNode=e,t=z0(),t.refCount++,e.pooledCache=t,t.refCount++,a.memoizedState={element:i,isDehydrated:n,cache:t},H0(a),e}function IM(e){return e?(e=Jo,e):Jo}function PM(e,t,n,i,s,a){s=IM(s),i.context===null?i.context=s:i.pendingContext=s,i=er(t),i.payload={element:n},a=a===void 0?null:a,a!==null&&(i.callback=a),n=nr(e,i,t),n!==null&&(Si(n,e,t),Vc(n,e,t))}function O1(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var n=e.retryLane;e.retryLane=n!==0&&n<t?n:t}}function yg(e,t){O1(e,t),(e=e.alternate)&&O1(e,t)}function zM(e){if(e.tag===13||e.tag===31){var t=Qr(e,67108864);t!==null&&Si(t,e,67108864),yg(e,67108864)}}function I1(e){if(e.tag===13||e.tag===31){var t=zi();t=T0(t);var n=Qr(e,t);n!==null&&Si(n,e,t),yg(e,t)}}var Ml=!0;function sC(e,t,n,i){var s=se.T;se.T=null;var a=Le.p;try{Le.p=2,_g(e,t,n,i)}finally{Le.p=a,se.T=s}}function aC(e,t,n,i){var s=se.T;se.T=null;var a=Le.p;try{Le.p=8,_g(e,t,n,i)}finally{Le.p=a,se.T=s}}function _g(e,t,n,i){if(Ml){var s=x0(i);if(s===null)om(e,t,i,yf,n),P1(e,i);else if(oC(s,e,t,n,i))i.stopPropagation();else if(P1(e,i),t&4&&-1<rC.indexOf(e)){for(;s!==null;){var a=Al(s);if(a!==null)switch(a.tag){case 3:if(a=a.stateNode,a.current.memoizedState.isDehydrated){var r=Dr(a.pendingLanes);if(r!==0){var o=a;for(o.pendingLanes|=2,o.entangledLanes|=2;r;){var l=1<<31-Pi(r);o.entanglements[1]|=l,r&=~l}ks(a),(Ue&6)===0&&(ff=Oi()+500,bu(0,!1))}}break;case 31:case 13:o=Qr(a,2),o!==null&&Si(o,a,2),Of(),yg(a,2)}if(a=x0(i),a===null&&om(e,t,i,yf,n),a===s)break;s=a}s!==null&&i.stopPropagation()}else om(e,t,i,null,n)}}function x0(e){return e=R0(e),xg(e)}var yf=null;function xg(e){if(yf=null,e=Lr(e),e!==null){var t=fu(e);if(t===null)e=null;else{var n=t.tag;if(n===13){if(e=G1(t),e!==null)return e;e=null}else if(n===31){if(e=k1(t),e!==null)return e;e=null}else if(n===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null)}}return yf=e,null}function BM(e){switch(e){case"beforetoggle":case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"seeked":case"submit":case"toggle":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"fullscreenerror":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 2;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"resize":case"scroll":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 8;case"message":switch(xw()){case K1:return 2;case j1:return 8;case qh:case bw:return 32;case Q1:return 268435456;default:return 32}default:return 32}}var b0=!1,rr=null,or=null,lr=null,uu=new Map,hu=new Map,qa=[],rC="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");function P1(e,t){switch(e){case"focusin":case"focusout":rr=null;break;case"dragenter":case"dragleave":or=null;break;case"mouseover":case"mouseout":lr=null;break;case"pointerover":case"pointerout":uu.delete(t.pointerId);break;case"gotpointercapture":case"lostpointercapture":hu.delete(t.pointerId)}}function Dc(e,t,n,i,s,a){return e===null||e.nativeEvent!==a?(e={blockedOn:t,domEventName:n,eventSystemFlags:i,nativeEvent:a,targetContainers:[s]},t!==null&&(t=Al(t),t!==null&&zM(t)),e):(e.eventSystemFlags|=i,t=e.targetContainers,s!==null&&t.indexOf(s)===-1&&t.push(s),e)}function oC(e,t,n,i,s){switch(t){case"focusin":return rr=Dc(rr,e,t,n,i,s),!0;case"dragenter":return or=Dc(or,e,t,n,i,s),!0;case"mouseover":return lr=Dc(lr,e,t,n,i,s),!0;case"pointerover":var a=s.pointerId;return uu.set(a,Dc(uu.get(a)||null,e,t,n,i,s)),!0;case"gotpointercapture":return a=s.pointerId,hu.set(a,Dc(hu.get(a)||null,e,t,n,i,s)),!0}return!1}function FM(e){var t=Lr(e.target);if(t!==null){var n=fu(t);if(n!==null){if(t=n.tag,t===13){if(t=G1(n),t!==null){e.blockedOn=t,lx(e.priority,function(){I1(n)});return}}else if(t===31){if(t=k1(n),t!==null){e.blockedOn=t,lx(e.priority,function(){I1(n)});return}}else if(t===3&&n.stateNode.current.memoizedState.isDehydrated){e.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}e.blockedOn=null}function Gh(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var n=x0(e.nativeEvent);if(n===null){n=e.nativeEvent;var i=new n.constructor(n.type,n);Em=i,n.target.dispatchEvent(i),Em=null}else return t=Al(n),t!==null&&zM(t),e.blockedOn=n,!1;t.shift()}return!0}function z1(e,t,n){Gh(e)&&n.delete(t)}function lC(){b0=!1,rr!==null&&Gh(rr)&&(rr=null),or!==null&&Gh(or)&&(or=null),lr!==null&&Gh(lr)&&(lr=null),uu.forEach(z1),hu.forEach(z1)}function Sh(e,t){e.blockedOn===t&&(e.blockedOn=null,b0||(b0=!0,wn.unstable_scheduleCallback(wn.unstable_NormalPriority,lC)))}var Mh=null;function B1(e){Mh!==e&&(Mh=e,wn.unstable_scheduleCallback(wn.unstable_NormalPriority,function(){Mh===e&&(Mh=null);for(var t=0;t<e.length;t+=3){var n=e[t],i=e[t+1],s=e[t+2];if(typeof i!="function"){if(xg(i||n)===null)continue;break}var a=Al(n);a!==null&&(e.splice(t,3),t-=3,Hm(a,{pending:!0,data:s,method:n.method,action:i},i,s))}}))}function El(e){function t(l){return Sh(l,e)}rr!==null&&Sh(rr,e),or!==null&&Sh(or,e),lr!==null&&Sh(lr,e),uu.forEach(t),hu.forEach(t);for(var n=0;n<qa.length;n++){var i=qa[n];i.blockedOn===e&&(i.blockedOn=null)}for(;0<qa.length&&(n=qa[0],n.blockedOn===null);)FM(n),n.blockedOn===null&&qa.shift();if(n=(e.ownerDocument||e).$$reactFormReplay,n!=null)for(i=0;i<n.length;i+=3){var s=n[i],a=n[i+1],r=s[Ei]||null;if(typeof a=="function")r||B1(n);else if(r){var o=null;if(a&&a.hasAttribute("formAction")){if(s=a,r=a[Ei]||null)o=r.formAction;else if(xg(s)!==null)continue}else o=r.action;typeof o=="function"?n[i+1]=o:(n.splice(i,3),i-=3),B1(n)}}}function HM(){function e(a){a.canIntercept&&a.info==="react-transition"&&a.intercept({handler:function(){return new Promise(function(r){return s=r})},focusReset:"manual",scroll:"manual"})}function t(){s!==null&&(s(),s=null),i||setTimeout(n,20)}function n(){if(!i&&!navigation.transition){var a=navigation.currentEntry;a&&a.url!=null&&navigation.navigate(a.url,{state:a.getState(),info:"react-transition",history:"replace"})}}if(typeof navigation=="object"){var i=!1,s=null;return navigation.addEventListener("navigate",e),navigation.addEventListener("navigatesuccess",t),navigation.addEventListener("navigateerror",t),setTimeout(n,100),function(){i=!0,navigation.removeEventListener("navigate",e),navigation.removeEventListener("navigatesuccess",t),navigation.removeEventListener("navigateerror",t),s!==null&&(s(),s=null)}}}function bg(e){this._internalRoot=e}zf.prototype.render=bg.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(at(409));var n=t.current,i=zi();PM(n,i,e,t,null,null)};zf.prototype.unmount=bg.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;PM(e.current,2,null,e,null,null),Of(),t[Tl]=null}};function zf(e){this._internalRoot=e}zf.prototype.unstable_scheduleHydration=function(e){if(e){var t=ib();e={blockedOn:null,target:e,priority:t};for(var n=0;n<qa.length&&t!==0&&t<qa[n].priority;n++);qa.splice(n,0,e),n===0&&FM(e)}};var F1=H1.version;if(F1!=="19.3.1")throw Error(at(527,F1,"19.3.1"));Le.findDOMNode=function(e){var t=e._reactInternals;if(t===void 0)throw typeof e.render=="function"?Error(at(188)):(e=Object.keys(e).join(","),Error(at(268,e)));return e=cw(t),e=e!==null?X1(e):null,e=e===null?null:e.stateNode,e};var cC={bundleType:0,version:"19.3.1",rendererPackageName:"react-dom",currentDispatcherRef:se,reconcilerVersion:"19.3.1"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"&&(Nc=__REACT_DEVTOOLS_GLOBAL_HOOK__,!Nc.isDisabled&&Nc.supportsFiber))try{du=Nc.inject(cC),Ii=Nc}catch{}var Nc;Bf.createRoot=function(e,t){if(!V1(e))throw Error(at(299));var n=!1,i="",s=xS,a=bS,r=SS;return t!=null&&(t.unstable_strictMode===!0&&(n=!0),t.identifierPrefix!==void 0&&(i=t.identifierPrefix),t.onUncaughtError!==void 0&&(s=t.onUncaughtError),t.onCaughtError!==void 0&&(a=t.onCaughtError),t.onRecoverableError!==void 0&&(r=t.onRecoverableError)),t=OM(e,1,!1,null,null,n,i,null,s,a,r,HM),e[Tl]=t.current,fg(e),new bg(t)};Bf.hydrateRoot=function(e,t,n){if(!V1(e))throw Error(at(299));var i=!1,s="",a=xS,r=bS,o=SS,l=null;return n!=null&&(n.unstable_strictMode===!0&&(i=!0),n.identifierPrefix!==void 0&&(s=n.identifierPrefix),n.onUncaughtError!==void 0&&(a=n.onUncaughtError),n.onCaughtError!==void 0&&(r=n.onCaughtError),n.onRecoverableError!==void 0&&(o=n.onRecoverableError),n.formState!==void 0&&(l=n.formState)),t=OM(e,1,!0,t,n??null,i,s,l,a,r,o,HM),t.context=IM(null),n=t.current,i=zi(),i=T0(i),s=er(i),s.callback=null,nr(n,s,i),n=i,t.current.lanes=n,mu(t,n),ks(t),e[Tl]=t.current,fg(e),new zf(t)};Bf.version="19.3.1"});var XM=ls((xI,kM)=>{"use strict";function GM(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(GM)}catch(e){console.error(e)}}GM(),kM.exports=VM()});function oc(){let e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0,i=Math.random()*4294967295|0;return(ti[e&255]+ti[e>>8&255]+ti[e>>16&255]+ti[e>>24&255]+"-"+ti[t&255]+ti[t>>8&255]+"-"+ti[t>>16&15|64]+ti[t>>24&255]+"-"+ti[n&63|128]+ti[n>>8&255]+"-"+ti[n>>16&255]+ti[n>>24&255]+ti[i&255]+ti[i>>8&255]+ti[i>>16&255]+ti[i>>24&255]).toLowerCase()}function ni(e,t,n){return Math.max(t,Math.min(n,e))}function gy(e,t){return(e%t+t)%t}function JC(e,t,n,i,s){return i+(e-t)*(s-i)/(n-t)}function $C(e,t,n){return e!==t?(n-e)/(t-e):0}function Nu(e,t,n){return(1-n)*e+n*t}function t3(e,t,n,i){return Nu(e,t,1-Math.exp(-n*i))}function e3(e,t=1){return t-Math.abs(gy(e,t*2)-t)}function n3(e,t,n){return e<=t?0:e>=n?1:(e=(e-t)/(n-t),e*e*(3-2*e))}function i3(e,t,n){return e<=t?0:e>=n?1:(e=(e-t)/(n-t),e*e*e*(e*(e*6-15)+10))}function s3(e,t){return e+Math.floor(Math.random()*(t-e+1))}function a3(e,t){return e+Math.random()*(t-e)}function r3(e){return e*(.5-Math.random())}function o3(e){e!==void 0&&(tE=e);let t=tE+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function l3(e){return e*Du}function c3(e){return e*Ou}function u3(e){return(e&e-1)===0&&e!==0}function h3(e){return Math.pow(2,Math.ceil(Math.log(e)/Math.LN2))}function f3(e){return Math.pow(2,Math.floor(Math.log(e)/Math.LN2))}function d3(e,t,n,i,s){let a=Math.cos,r=Math.sin,o=a(n/2),l=r(n/2),c=a((t+i)/2),u=r((t+i)/2),d=a((t-i)/2),h=r((t-i)/2),p=a((i-t)/2),g=r((i-t)/2);switch(s){case"XYX":e.set(o*u,l*d,l*h,o*c);break;case"YZY":e.set(l*h,o*u,l*d,o*c);break;case"ZXZ":e.set(l*d,l*h,o*u,o*c);break;case"XZX":e.set(o*u,l*g,l*p,o*c);break;case"YXY":e.set(l*p,o*u,l*g,o*c);break;case"ZYZ":e.set(l*g,l*p,o*u,o*c);break;default:console.warn("THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+s)}}function ql(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return e/4294967295;case Uint16Array:return e/65535;case Uint8Array:return e/255;case Int32Array:return Math.max(e/2147483647,-1);case Int16Array:return Math.max(e/32767,-1);case Int8Array:return Math.max(e/127,-1);default:throw new Error("Invalid component type.")}}function di(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return Math.round(e*4294967295);case Uint16Array:return Math.round(e*65535);case Uint8Array:return Math.round(e*255);case Int32Array:return Math.round(e*2147483647);case Int16Array:return Math.round(e*32767);case Int8Array:return Math.round(e*127);default:throw new Error("Invalid component type.")}}function aT(e){for(let t=e.length-1;t>=0;--t)if(e[t]>=65535)return!0;return!1}function xd(e){return document.createElementNS("http://www.w3.org/1999/xhtml",e)}function p3(){let e=xd("canvas");return e.style.display="block",e}function pd(e){e in eE||(eE[e]=!0,console.warn(e))}function m3(e,t,n){return new Promise(function(i,s){function a(){switch(e.clientWaitSync(t,e.SYNC_FLUSH_COMMANDS_BIT,0)){case e.WAIT_FAILED:s();break;case e.TIMEOUT_EXPIRED:setTimeout(a,n);break;default:i()}}setTimeout(a,n)})}function g3(e){let t=e.elements;t[2]=.5*t[2]+.5*t[3],t[6]=.5*t[6]+.5*t[7],t[10]=.5*t[10]+.5*t[11],t[14]=.5*t[14]+.5*t[15]}function v3(e){let t=e.elements;t[11]===-1?(t[10]=-t[10]-1,t[14]=-t[14]):(t[10]=-t[10],t[14]=-t[14]+1)}function jl(e){return e<.04045?e*.0773993808:Math.pow(e*.9478672986+.0521327014,2.4)}function Tg(e){return e<.0031308?e*12.92:1.055*Math.pow(e,.41666)-.055}function Ag(e){return typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap?Pv.getDataURL(e):e.data?{data:Array.from(e.data),width:e.width,height:e.height,type:e.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}function Rg(e,t,n,i,s){for(let a=0,r=e.length-3;a<=r;a+=3){to.fromArray(e,a);let o=s.x*Math.abs(to.x)+s.y*Math.abs(to.y)+s.z*Math.abs(to.z),l=t.dot(to),c=n.dot(to),u=i.dot(to);if(Math.max(-Math.max(l,c,u),Math.min(l,c,u))>o)return!1}return!0}function Vg(e,t,n){return n<0&&(n+=1),n>1&&(n-=1),n<1/6?e+(t-e)*6*n:n<1/2?t:n<2/3?e+(t-e)*6*(2/3-n):e}function D3(e,t,n,i,s,a,r,o){let l;if(t.side===Ti?l=i.intersectTriangle(r,a,s,!0,o):l=i.intersectTriangle(s,a,r,t.side===Zs,o),l===null)return null;td.copy(o),td.applyMatrix4(e.matrixWorld);let c=n.ray.origin.distanceTo(td);return c<n.near||c>n.far?null:{distance:c,point:td.clone(),object:e}}function ed(e,t,n,i,s,a,r,o,l,c){e.getVertexPosition(o,jf),e.getVertexPosition(l,Qf),e.getVertexPosition(c,Jf);let u=D3(e,t,n,i,jf,Qf,Jf,mE);if(u){let d=new W;oo.getBarycoord(mE,jf,Qf,Jf,d),s&&(u.uv=oo.getInterpolatedAttribute(s,o,l,c,d,new Yt)),a&&(u.uv1=oo.getInterpolatedAttribute(a,o,l,c,d,new Yt)),r&&(u.normal=oo.getInterpolatedAttribute(r,o,l,c,d,new W),u.normal.dot(i.direction)>0&&u.normal.multiplyScalar(-1));let h={a:o,b:l,c,normal:new W,materialIndex:0};oo.getNormal(jf,Qf,Jf,h.normal),u.face=h,u.barycoord=d}return u}function sc(e){let t={};for(let n in e){t[n]={};for(let i in e[n]){let s=e[n][i];s&&(s.isColor||s.isMatrix3||s.isMatrix4||s.isVector2||s.isVector3||s.isVector4||s.isTexture||s.isQuaternion)?s.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[n][i]=null):t[n][i]=s.clone():Array.isArray(s)?t[n][i]=s.slice():t[n][i]=s}}return t}function pi(e){let t={};for(let n=0;n<e.length;n++){let i=sc(e[n]);for(let s in i)t[s]=i[s]}return t}function N3(e){let t=[];for(let n=0;n<e.length;n++)t.push(e[n].clone());return t}function oT(e){let t=e.getRenderTarget();return t===null?e.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:ze.workingColorSpace}function lT(){let e=null,t=!1,n=null,i=null;function s(a,r){n(a,r),i=e.requestAnimationFrame(s)}return{start:function(){t!==!0&&n!==null&&(i=e.requestAnimationFrame(s),t=!0)},stop:function(){e.cancelAnimationFrame(i),t=!1},setAnimationLoop:function(a){n=a},setContext:function(a){e=a}}}function P3(e){let t=new WeakMap;function n(o,l){let c=o.array,u=o.usage,d=c.byteLength,h=e.createBuffer();e.bindBuffer(l,h),e.bufferData(l,c,u),o.onUploadCallback();let p;if(c instanceof Float32Array)p=e.FLOAT;else if(c instanceof Uint16Array)o.isFloat16BufferAttribute?p=e.HALF_FLOAT:p=e.UNSIGNED_SHORT;else if(c instanceof Int16Array)p=e.SHORT;else if(c instanceof Uint32Array)p=e.UNSIGNED_INT;else if(c instanceof Int32Array)p=e.INT;else if(c instanceof Int8Array)p=e.BYTE;else if(c instanceof Uint8Array)p=e.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)p=e.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:h,type:p,bytesPerElement:c.BYTES_PER_ELEMENT,version:o.version,size:d}}function i(o,l,c){let u=l.array,d=l.updateRanges;if(e.bindBuffer(c,o),d.length===0)e.bufferSubData(c,0,u);else{d.sort((p,g)=>p.start-g.start);let h=0;for(let p=1;p<d.length;p++){let g=d[h],S=d[p];S.start<=g.start+g.count+1?g.count=Math.max(g.count,S.start+S.count-g.start):(++h,d[h]=S)}d.length=h+1;for(let p=0,g=d.length;p<g;p++){let S=d[p];e.bufferSubData(c,S.start*u.BYTES_PER_ELEMENT,u,S.start,S.count)}l.clearUpdateRanges()}l.onUploadCallback()}function s(o){return o.isInterleavedBufferAttribute&&(o=o.data),t.get(o)}function a(o){o.isInterleavedBufferAttribute&&(o=o.data);let l=t.get(o);l&&(e.deleteBuffer(l.buffer),t.delete(o))}function r(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){let u=t.get(o);(!u||u.version<o.version)&&t.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}let c=t.get(o);if(c===void 0)t.set(o,n(o,l));else if(c.version<o.version){if(c.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");i(c.buffer,o,l),c.version=o.version}}return{get:s,remove:a,update:r}}function vU(e,t,n,i,s,a,r){let o=new fe(0),l=a===!0?0:1,c,u,d=null,h=0,p=null;function g(y){let _=y.isScene===!0?y.background:null;return _&&_.isTexture&&(_=(y.backgroundBlurriness>0?n:t).get(_)),_}function S(y){let _=!1,b=g(y);b===null?f(o,l):b&&b.isColor&&(f(b,1),_=!0);let D=e.xr.getEnvironmentBlendMode();D==="additive"?i.buffers.color.setClear(0,0,0,1,r):D==="alpha-blend"&&i.buffers.color.setClear(0,0,0,0,r),(e.autoClear||_)&&(i.buffers.depth.setTest(!0),i.buffers.depth.setMask(!0),i.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil))}function m(y,_){let b=g(_);b&&(b.isCubeTexture||b.mapping===Hd)?(u===void 0&&(u=new si(new Iu(1,1,1),new un({name:"BackgroundCubeMaterial",uniforms:sc(Ws.backgroundCube.uniforms),vertexShader:Ws.backgroundCube.vertexShader,fragmentShader:Ws.backgroundCube.fragmentShader,side:Ti,depthTest:!1,depthWrite:!1,fog:!1})),u.geometry.deleteAttribute("normal"),u.geometry.deleteAttribute("uv"),u.onBeforeRender=function(D,R,A){this.matrixWorld.copyPosition(A.matrixWorld)},Object.defineProperty(u.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),s.update(u)),io.copy(_.backgroundRotation),io.x*=-1,io.y*=-1,io.z*=-1,b.isCubeTexture&&b.isRenderTargetTexture===!1&&(io.y*=-1,io.z*=-1),u.material.uniforms.envMap.value=b,u.material.uniforms.flipEnvMap.value=b.isCubeTexture&&b.isRenderTargetTexture===!1?-1:1,u.material.uniforms.backgroundBlurriness.value=_.backgroundBlurriness,u.material.uniforms.backgroundIntensity.value=_.backgroundIntensity,u.material.uniforms.backgroundRotation.value.setFromMatrix4(gU.makeRotationFromEuler(io)),u.material.toneMapped=ze.getTransfer(b.colorSpace)!==nn,(d!==b||h!==b.version||p!==e.toneMapping)&&(u.material.needsUpdate=!0,d=b,h=b.version,p=e.toneMapping),u.layers.enableAll(),y.unshift(u,u.geometry,u.material,0,0,null)):b&&b.isTexture&&(c===void 0&&(c=new si(new Cd(2,2),new un({name:"BackgroundMaterial",uniforms:sc(Ws.background.uniforms),vertexShader:Ws.background.vertexShader,fragmentShader:Ws.background.fragmentShader,side:Zs,depthTest:!1,depthWrite:!1,fog:!1})),c.geometry.deleteAttribute("normal"),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),s.update(c)),c.material.uniforms.t2D.value=b,c.material.uniforms.backgroundIntensity.value=_.backgroundIntensity,c.material.toneMapped=ze.getTransfer(b.colorSpace)!==nn,b.matrixAutoUpdate===!0&&b.updateMatrix(),c.material.uniforms.uvTransform.value.copy(b.matrix),(d!==b||h!==b.version||p!==e.toneMapping)&&(c.material.needsUpdate=!0,d=b,h=b.version,p=e.toneMapping),c.layers.enableAll(),y.unshift(c,c.geometry,c.material,0,0,null))}function f(y,_){y.getRGB(id,oT(e)),i.buffers.color.setClear(id.r,id.g,id.b,_,r)}return{getClearColor:function(){return o},setClearColor:function(y,_=1){o.set(y),l=_,f(o,l)},getClearAlpha:function(){return l},setClearAlpha:function(y){l=y,f(o,l)},render:S,addToRenderList:m}}function yU(e,t){let n=e.getParameter(e.MAX_VERTEX_ATTRIBS),i={},s=h(null),a=s,r=!1;function o(v,M,F,q,K){let $=!1,B=d(q,F,M);a!==B&&(a=B,c(a.object)),$=p(v,q,F,K),$&&g(v,q,F,K),K!==null&&t.update(K,e.ELEMENT_ARRAY_BUFFER),($||r)&&(r=!1,b(v,M,F,q),K!==null&&e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,t.get(K).buffer))}function l(){return e.createVertexArray()}function c(v){return e.bindVertexArray(v)}function u(v){return e.deleteVertexArray(v)}function d(v,M,F){let q=F.wireframe===!0,K=i[v.id];K===void 0&&(K={},i[v.id]=K);let $=K[M.id];$===void 0&&($={},K[M.id]=$);let B=$[q];return B===void 0&&(B=h(l()),$[q]=B),B}function h(v){let M=[],F=[],q=[];for(let K=0;K<n;K++)M[K]=0,F[K]=0,q[K]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:M,enabledAttributes:F,attributeDivisors:q,object:v,attributes:{},index:null}}function p(v,M,F,q){let K=a.attributes,$=M.attributes,B=0,ct=F.getAttributes();for(let Z in ct)if(ct[Z].location>=0){let mt=K[Z],ft=$[Z];if(ft===void 0&&(Z==="instanceMatrix"&&v.instanceMatrix&&(ft=v.instanceMatrix),Z==="instanceColor"&&v.instanceColor&&(ft=v.instanceColor)),mt===void 0||mt.attribute!==ft||ft&&mt.data!==ft.data)return!0;B++}return a.attributesNum!==B||a.index!==q}function g(v,M,F,q){let K={},$=M.attributes,B=0,ct=F.getAttributes();for(let Z in ct)if(ct[Z].location>=0){let mt=$[Z];mt===void 0&&(Z==="instanceMatrix"&&v.instanceMatrix&&(mt=v.instanceMatrix),Z==="instanceColor"&&v.instanceColor&&(mt=v.instanceColor));let ft={};ft.attribute=mt,mt&&mt.data&&(ft.data=mt.data),K[Z]=ft,B++}a.attributes=K,a.attributesNum=B,a.index=q}function S(){let v=a.newAttributes;for(let M=0,F=v.length;M<F;M++)v[M]=0}function m(v){f(v,0)}function f(v,M){let F=a.newAttributes,q=a.enabledAttributes,K=a.attributeDivisors;F[v]=1,q[v]===0&&(e.enableVertexAttribArray(v),q[v]=1),K[v]!==M&&(e.vertexAttribDivisor(v,M),K[v]=M)}function y(){let v=a.newAttributes,M=a.enabledAttributes;for(let F=0,q=M.length;F<q;F++)M[F]!==v[F]&&(e.disableVertexAttribArray(F),M[F]=0)}function _(v,M,F,q,K,$,B){B===!0?e.vertexAttribIPointer(v,M,F,K,$):e.vertexAttribPointer(v,M,F,q,K,$)}function b(v,M,F,q){S();let K=q.attributes,$=F.getAttributes(),B=M.defaultAttributeValues;for(let ct in $){let Z=$[ct];if(Z.location>=0){let wt=K[ct];if(wt===void 0&&(ct==="instanceMatrix"&&v.instanceMatrix&&(wt=v.instanceMatrix),ct==="instanceColor"&&v.instanceColor&&(wt=v.instanceColor)),wt!==void 0){let mt=wt.normalized,ft=wt.itemSize,Ht=t.get(wt);if(Ht===void 0)continue;let ie=Ht.buffer,nt=Ht.type,rt=Ht.bytesPerElement,Rt=nt===e.INT||nt===e.UNSIGNED_INT||wt.gpuType===cy;if(wt.isInterleavedBufferAttribute){let St=wt.data,Kt=St.stride,Nt=wt.offset;if(St.isInstancedInterleavedBuffer){for(let Vt=0;Vt<Z.locationSize;Vt++)f(Z.location+Vt,St.meshPerAttribute);v.isInstancedMesh!==!0&&q._maxInstanceCount===void 0&&(q._maxInstanceCount=St.meshPerAttribute*St.count)}else for(let Vt=0;Vt<Z.locationSize;Vt++)m(Z.location+Vt);e.bindBuffer(e.ARRAY_BUFFER,ie);for(let Vt=0;Vt<Z.locationSize;Vt++)_(Z.location+Vt,ft/Z.locationSize,nt,mt,Kt*rt,(Nt+ft/Z.locationSize*Vt)*rt,Rt)}else{if(wt.isInstancedBufferAttribute){for(let St=0;St<Z.locationSize;St++)f(Z.location+St,wt.meshPerAttribute);v.isInstancedMesh!==!0&&q._maxInstanceCount===void 0&&(q._maxInstanceCount=wt.meshPerAttribute*wt.count)}else for(let St=0;St<Z.locationSize;St++)m(Z.location+St);e.bindBuffer(e.ARRAY_BUFFER,ie);for(let St=0;St<Z.locationSize;St++)_(Z.location+St,ft/Z.locationSize,nt,mt,ft*rt,ft/Z.locationSize*St*rt,Rt)}}else if(B!==void 0){let mt=B[ct];if(mt!==void 0)switch(mt.length){case 2:e.vertexAttrib2fv(Z.location,mt);break;case 3:e.vertexAttrib3fv(Z.location,mt);break;case 4:e.vertexAttrib4fv(Z.location,mt);break;default:e.vertexAttrib1fv(Z.location,mt)}}}}y()}function D(){N();for(let v in i){let M=i[v];for(let F in M){let q=M[F];for(let K in q)u(q[K].object),delete q[K];delete M[F]}delete i[v]}}function R(v){if(i[v.id]===void 0)return;let M=i[v.id];for(let F in M){let q=M[F];for(let K in q)u(q[K].object),delete q[K];delete M[F]}delete i[v.id]}function A(v){for(let M in i){let F=i[M];if(F[v.id]===void 0)continue;let q=F[v.id];for(let K in q)u(q[K].object),delete q[K];delete F[v.id]}}function N(){et(),r=!0,a!==s&&(a=s,c(a.object))}function et(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:o,reset:N,resetDefaultState:et,dispose:D,releaseStatesOfGeometry:R,releaseStatesOfProgram:A,initAttributes:S,enableAttribute:m,disableUnusedAttributes:y}}function _U(e,t,n){let i;function s(c){i=c}function a(c,u){e.drawArrays(i,c,u),n.update(u,i,1)}function r(c,u,d){d!==0&&(e.drawArraysInstanced(i,c,u,d),n.update(u,i,d))}function o(c,u,d){if(d===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(i,c,0,u,0,d);let p=0;for(let g=0;g<d;g++)p+=u[g];n.update(p,i,1)}function l(c,u,d,h){if(d===0)return;let p=t.get("WEBGL_multi_draw");if(p===null)for(let g=0;g<c.length;g++)r(c[g],u[g],h[g]);else{p.multiDrawArraysInstancedWEBGL(i,c,0,u,0,h,0,d);let g=0;for(let S=0;S<d;S++)g+=u[S];for(let S=0;S<h.length;S++)n.update(g,i,h[S])}}this.setMode=s,this.render=a,this.renderInstances=r,this.renderMultiDraw=o,this.renderMultiDrawInstances=l}function xU(e,t,n,i){let s;function a(){if(s!==void 0)return s;if(t.has("EXT_texture_filter_anisotropic")===!0){let A=t.get("EXT_texture_filter_anisotropic");s=e.getParameter(A.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function r(A){return!(A!==xs&&i.convert(A)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(A){let N=A===Es&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(A!==bs&&i.convert(A)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE)&&A!==Ta&&!N)}function l(A){if(A==="highp"){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return"highp";A="mediump"}return A==="mediump"&&e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=n.precision!==void 0?n.precision:"highp",u=l(c);u!==c&&(console.warn("THREE.WebGLRenderer:",c,"not supported, using",u,"instead."),c=u);let d=n.logarithmicDepthBuffer===!0,h=n.reverseDepthBuffer===!0&&t.has("EXT_clip_control");if(h===!0){let A=t.get("EXT_clip_control");A.clipControlEXT(A.LOWER_LEFT_EXT,A.ZERO_TO_ONE_EXT)}let p=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),g=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),S=e.getParameter(e.MAX_TEXTURE_SIZE),m=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),f=e.getParameter(e.MAX_VERTEX_ATTRIBS),y=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),_=e.getParameter(e.MAX_VARYING_VECTORS),b=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),D=g>0,R=e.getParameter(e.MAX_SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:a,getMaxPrecision:l,textureFormatReadable:r,textureTypeReadable:o,precision:c,logarithmicDepthBuffer:d,reverseDepthBuffer:h,maxTextures:p,maxVertexTextures:g,maxTextureSize:S,maxCubemapSize:m,maxAttributes:f,maxVertexUniforms:y,maxVaryings:_,maxFragmentUniforms:b,vertexTextures:D,maxSamples:R}}function bU(e){let t=this,n=null,i=0,s=!1,a=!1,r=new ys,o=new ye,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(d,h){let p=d.length!==0||h||i!==0||s;return s=h,i=d.length,p},this.beginShadows=function(){a=!0,u(null)},this.endShadows=function(){a=!1},this.setGlobalState=function(d,h){n=u(d,h,0)},this.setState=function(d,h,p){let g=d.clippingPlanes,S=d.clipIntersection,m=d.clipShadows,f=e.get(d);if(!s||g===null||g.length===0||a&&!m)a?u(null):c();else{let y=a?0:i,_=y*4,b=f.clippingState||null;l.value=b,b=u(g,h,_,p);for(let D=0;D!==_;++D)b[D]=n[D];f.clippingState=b,this.numIntersection=S?this.numPlanes:0,this.numPlanes+=y}};function c(){l.value!==n&&(l.value=n,l.needsUpdate=i>0),t.numPlanes=i,t.numIntersection=0}function u(d,h,p,g){let S=d!==null?d.length:0,m=null;if(S!==0){if(m=l.value,g!==!0||m===null){let f=p+S*4,y=h.matrixWorldInverse;o.getNormalMatrix(y),(m===null||m.length<f)&&(m=new Float32Array(f));for(let _=0,b=p;_!==S;++_,b+=4)r.copy(d[_]).applyMatrix4(y,o),r.normal.toArray(m,b),m[b+3]=r.constant}l.value=m,l.needsUpdate=!0}return t.numPlanes=S,t.numIntersection=0,m}}function SU(e){let t=new WeakMap;function n(r,o){return o===av?r.mapping=Jl:o===rv&&(r.mapping=$l),r}function i(r){if(r&&r.isTexture){let o=r.mapping;if(o===av||o===rv)if(t.has(r)){let l=t.get(r).texture;return n(l,r.mapping)}else{let l=r.image;if(l&&l.height>0){let c=new Hv(l.height);return c.fromEquirectangularTexture(e,r),t.set(r,c),r.addEventListener("dispose",s),n(c.texture,r.mapping)}else return null}}return r}function s(r){let o=r.target;o.removeEventListener("dispose",s);let l=t.get(o);l!==void 0&&(t.delete(o),l.dispose())}function a(){t=new WeakMap}return{get:i,dispose:a}}function MU(e){let t=[],n=[],i=[],s=e,a=e-Yl+1+yE.length;for(let r=0;r<a;r++){let o=Math.pow(2,s);n.push(o);let l=1/o;r>e-Yl?l=yE[r-e+Yl-1]:r===0&&(l=0),i.push(l);let c=1/(o-2),u=-c,d=1+c,h=[u,u,d,u,d,d,u,u,d,d,u,d],p=6,g=6,S=3,m=2,f=1,y=new Float32Array(S*g*p),_=new Float32Array(m*g*p),b=new Float32Array(f*g*p);for(let R=0;R<p;R++){let A=R%3*2/3-1,N=R>2?0:-1,et=[A,N,0,A+2/3,N,0,A+2/3,N+1,0,A,N,0,A+2/3,N+1,0,A,N+1,0];y.set(et,S*g*R),_.set(h,m*g*R);let v=[R,R,R,R,R,R];b.set(v,f*g*R)}let D=new En;D.setAttribute("position",new qe(y,S)),D.setAttribute("uv",new qe(_,m)),D.setAttribute("faceIndex",new qe(b,f)),t.push(D),s>Yl&&s--}return{lodPlanes:t,sizeLods:n,sigmas:i}}function bE(e,t,n){let i=new Zn(e,t,n);return i.texture.mapping=Hd,i.texture.name="PMREM.cubeUv",i.scissorTest=!0,i}function sd(e,t,n,i,s){e.viewport.set(t,n,i,s),e.scissor.set(t,n,i,s)}function EU(e,t,n){let i=new Float32Array(lo),s=new W(0,1,0);return new un({name:"SphericalGaussianBlur",defines:{n:lo,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:i},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:s}},vertexShader:vy(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:qs,depthTest:!1,depthWrite:!1})}function SE(){return new un({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:vy(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:qs,depthTest:!1,depthWrite:!1})}function ME(){return new un({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:vy(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:qs,depthTest:!1,depthWrite:!1})}function vy(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function TU(e){let t=new WeakMap,n=null;function i(o){if(o&&o.isTexture){let l=o.mapping,c=l===av||l===rv,u=l===Jl||l===$l;if(c||u){let d=t.get(o),h=d!==void 0?d.texture.pmremVersion:0;if(o.isRenderTargetTexture&&o.pmremVersion!==h)return n===null&&(n=new Dd(e)),d=c?n.fromEquirectangular(o,d):n.fromCubemap(o,d),d.texture.pmremVersion=o.pmremVersion,t.set(o,d),d.texture;if(d!==void 0)return d.texture;{let p=o.image;return c&&p&&p.height>0||u&&p&&s(p)?(n===null&&(n=new Dd(e)),d=c?n.fromEquirectangular(o):n.fromCubemap(o),d.texture.pmremVersion=o.pmremVersion,t.set(o,d),o.addEventListener("dispose",a),d.texture):null}}}return o}function s(o){let l=0,c=6;for(let u=0;u<c;u++)o[u]!==void 0&&l++;return l===c}function a(o){let l=o.target;l.removeEventListener("dispose",a);let c=t.get(l);c!==void 0&&(t.delete(l),c.dispose())}function r(){t=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:i,dispose:r}}function AU(e){let t={};function n(i){if(t[i]!==void 0)return t[i];let s;switch(i){case"WEBGL_depth_texture":s=e.getExtension("WEBGL_depth_texture")||e.getExtension("MOZ_WEBGL_depth_texture")||e.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":s=e.getExtension("EXT_texture_filter_anisotropic")||e.getExtension("MOZ_EXT_texture_filter_anisotropic")||e.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":s=e.getExtension("WEBGL_compressed_texture_s3tc")||e.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||e.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":s=e.getExtension("WEBGL_compressed_texture_pvrtc")||e.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:s=e.getExtension(i)}return t[i]=s,s}return{has:function(i){return n(i)!==null},init:function(){n("EXT_color_buffer_float"),n("WEBGL_clip_cull_distance"),n("OES_texture_float_linear"),n("EXT_color_buffer_half_float"),n("WEBGL_multisampled_render_to_texture"),n("WEBGL_render_shared_exponent")},get:function(i){let s=n(i);return s===null&&pd("THREE.WebGLRenderer: "+i+" extension not supported."),s}}}function wU(e,t,n,i){let s={},a=new WeakMap;function r(d){let h=d.target;h.index!==null&&t.remove(h.index);for(let g in h.attributes)t.remove(h.attributes[g]);for(let g in h.morphAttributes){let S=h.morphAttributes[g];for(let m=0,f=S.length;m<f;m++)t.remove(S[m])}h.removeEventListener("dispose",r),delete s[h.id];let p=a.get(h);p&&(t.remove(p),a.delete(h)),i.releaseStatesOfGeometry(h),h.isInstancedBufferGeometry===!0&&delete h._maxInstanceCount,n.memory.geometries--}function o(d,h){return s[h.id]===!0||(h.addEventListener("dispose",r),s[h.id]=!0,n.memory.geometries++),h}function l(d){let h=d.attributes;for(let g in h)t.update(h[g],e.ARRAY_BUFFER);let p=d.morphAttributes;for(let g in p){let S=p[g];for(let m=0,f=S.length;m<f;m++)t.update(S[m],e.ARRAY_BUFFER)}}function c(d){let h=[],p=d.index,g=d.attributes.position,S=0;if(p!==null){let y=p.array;S=p.version;for(let _=0,b=y.length;_<b;_+=3){let D=y[_+0],R=y[_+1],A=y[_+2];h.push(D,R,R,A,A,D)}}else if(g!==void 0){let y=g.array;S=g.version;for(let _=0,b=y.length/3-1;_<b;_+=3){let D=_+0,R=_+1,A=_+2;h.push(D,R,R,A,A,D)}}else return;let m=new(aT(h)?Td:Ed)(h,1);m.version=S;let f=a.get(d);f&&t.remove(f),a.set(d,m)}function u(d){let h=a.get(d);if(h){let p=d.index;p!==null&&h.version<p.version&&c(d)}else c(d);return a.get(d)}return{get:o,update:l,getWireframeAttribute:u}}function RU(e,t,n){let i;function s(h){i=h}let a,r;function o(h){a=h.type,r=h.bytesPerElement}function l(h,p){e.drawElements(i,p,a,h*r),n.update(p,i,1)}function c(h,p,g){g!==0&&(e.drawElementsInstanced(i,p,a,h*r,g),n.update(p,i,g))}function u(h,p,g){if(g===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(i,p,0,a,h,0,g);let m=0;for(let f=0;f<g;f++)m+=p[f];n.update(m,i,1)}function d(h,p,g,S){if(g===0)return;let m=t.get("WEBGL_multi_draw");if(m===null)for(let f=0;f<h.length;f++)c(h[f]/r,p[f],S[f]);else{m.multiDrawElementsInstancedWEBGL(i,p,0,a,h,0,S,0,g);let f=0;for(let y=0;y<g;y++)f+=p[y];for(let y=0;y<S.length;y++)n.update(f,i,S[y])}}this.setMode=s,this.setIndex=o,this.render=l,this.renderInstances=c,this.renderMultiDraw=u,this.renderMultiDrawInstances=d}function CU(e){let t={geometries:0,textures:0},n={frame:0,calls:0,triangles:0,points:0,lines:0};function i(a,r,o){switch(n.calls++,r){case e.TRIANGLES:n.triangles+=o*(a/3);break;case e.LINES:n.lines+=o*(a/2);break;case e.LINE_STRIP:n.lines+=o*(a-1);break;case e.LINE_LOOP:n.lines+=o*a;break;case e.POINTS:n.points+=o*a;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",r);break}}function s(){n.calls=0,n.triangles=0,n.points=0,n.lines=0}return{memory:t,render:n,programs:null,autoReset:!0,reset:s,update:i}}function DU(e,t,n){let i=new WeakMap,s=new ke;function a(r,o,l){let c=r.morphTargetInfluences,u=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,d=u!==void 0?u.length:0,h=i.get(o);if(h===void 0||h.count!==d){let et=function(){A.dispose(),i.delete(o),o.removeEventListener("dispose",et)};h!==void 0&&h.texture.dispose();let p=o.morphAttributes.position!==void 0,g=o.morphAttributes.normal!==void 0,S=o.morphAttributes.color!==void 0,m=o.morphAttributes.position||[],f=o.morphAttributes.normal||[],y=o.morphAttributes.color||[],_=0;p===!0&&(_=1),g===!0&&(_=2),S===!0&&(_=3);let b=o.attributes.position.count*_,D=1;b>t.maxTextureSize&&(D=Math.ceil(b/t.maxTextureSize),b=t.maxTextureSize);let R=new Float32Array(b*D*4*d),A=new Sd(R,b,D,d);A.type=Ta,A.needsUpdate=!0;let N=_*4;for(let v=0;v<d;v++){let M=m[v],F=f[v],q=y[v],K=b*D*4*v;for(let $=0;$<M.count;$++){let B=$*N;p===!0&&(s.fromBufferAttribute(M,$),R[K+B+0]=s.x,R[K+B+1]=s.y,R[K+B+2]=s.z,R[K+B+3]=0),g===!0&&(s.fromBufferAttribute(F,$),R[K+B+4]=s.x,R[K+B+5]=s.y,R[K+B+6]=s.z,R[K+B+7]=0),S===!0&&(s.fromBufferAttribute(q,$),R[K+B+8]=s.x,R[K+B+9]=s.y,R[K+B+10]=s.z,R[K+B+11]=q.itemSize===4?s.w:1)}}h={count:d,texture:A,size:new Yt(b,D)},i.set(o,h),o.addEventListener("dispose",et)}if(r.isInstancedMesh===!0&&r.morphTexture!==null)l.getUniforms().setValue(e,"morphTexture",r.morphTexture,n);else{let p=0;for(let S=0;S<c.length;S++)p+=c[S];let g=o.morphTargetsRelative?1:1-p;l.getUniforms().setValue(e,"morphTargetBaseInfluence",g),l.getUniforms().setValue(e,"morphTargetInfluences",c)}l.getUniforms().setValue(e,"morphTargetsTexture",h.texture,n),l.getUniforms().setValue(e,"morphTargetsTextureSize",h.size)}return{update:a}}function NU(e,t,n,i){let s=new WeakMap;function a(l){let c=i.render.frame,u=l.geometry,d=t.get(l,u);if(s.get(d)!==c&&(t.update(d),s.set(d,c)),l.isInstancedMesh&&(l.hasEventListener("dispose",o)===!1&&l.addEventListener("dispose",o),s.get(l)!==c&&(n.update(l.instanceMatrix,e.ARRAY_BUFFER),l.instanceColor!==null&&n.update(l.instanceColor,e.ARRAY_BUFFER),s.set(l,c))),l.isSkinnedMesh){let h=l.skeleton;s.get(h)!==c&&(h.update(),s.set(h,c))}return d}function r(){s=new WeakMap}function o(l){let c=l.target;c.removeEventListener("dispose",o),n.remove(c.instanceMatrix),c.instanceColor!==null&&n.remove(c.instanceColor)}return{update:a,dispose:r}}function cc(e,t,n){let i=e[0];if(i<=0||i>0)return e;let s=t*n,a=TE[s];if(a===void 0&&(a=new Float32Array(s),TE[s]=a),t!==0){i.toArray(a,0);for(let r=1,o=0;r!==t;++r)o+=n,e[r].toArray(a,o)}return a}function Rn(e,t){if(e.length!==t.length)return!1;for(let n=0,i=e.length;n<i;n++)if(e[n]!==t[n])return!1;return!0}function Cn(e,t){for(let n=0,i=t.length;n<i;n++)e[n]=t[n]}function Gd(e,t){let n=AE[t];n===void 0&&(n=new Int32Array(t),AE[t]=n);for(let i=0;i!==t;++i)n[i]=e.allocateTextureUnit();return n}function UU(e,t){let n=this.cache;n[0]!==t&&(e.uniform1f(this.addr,t),n[0]=t)}function LU(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2f(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(Rn(n,t))return;e.uniform2fv(this.addr,t),Cn(n,t)}}function OU(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3f(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else if(t.r!==void 0)(n[0]!==t.r||n[1]!==t.g||n[2]!==t.b)&&(e.uniform3f(this.addr,t.r,t.g,t.b),n[0]=t.r,n[1]=t.g,n[2]=t.b);else{if(Rn(n,t))return;e.uniform3fv(this.addr,t),Cn(n,t)}}function IU(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4f(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(Rn(n,t))return;e.uniform4fv(this.addr,t),Cn(n,t)}}function PU(e,t){let n=this.cache,i=t.elements;if(i===void 0){if(Rn(n,t))return;e.uniformMatrix2fv(this.addr,!1,t),Cn(n,t)}else{if(Rn(n,i))return;CE.set(i),e.uniformMatrix2fv(this.addr,!1,CE),Cn(n,i)}}function zU(e,t){let n=this.cache,i=t.elements;if(i===void 0){if(Rn(n,t))return;e.uniformMatrix3fv(this.addr,!1,t),Cn(n,t)}else{if(Rn(n,i))return;RE.set(i),e.uniformMatrix3fv(this.addr,!1,RE),Cn(n,i)}}function BU(e,t){let n=this.cache,i=t.elements;if(i===void 0){if(Rn(n,t))return;e.uniformMatrix4fv(this.addr,!1,t),Cn(n,t)}else{if(Rn(n,i))return;wE.set(i),e.uniformMatrix4fv(this.addr,!1,wE),Cn(n,i)}}function FU(e,t){let n=this.cache;n[0]!==t&&(e.uniform1i(this.addr,t),n[0]=t)}function HU(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2i(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(Rn(n,t))return;e.uniform2iv(this.addr,t),Cn(n,t)}}function VU(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3i(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(Rn(n,t))return;e.uniform3iv(this.addr,t),Cn(n,t)}}function GU(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4i(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(Rn(n,t))return;e.uniform4iv(this.addr,t),Cn(n,t)}}function kU(e,t){let n=this.cache;n[0]!==t&&(e.uniform1ui(this.addr,t),n[0]=t)}function XU(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2ui(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(Rn(n,t))return;e.uniform2uiv(this.addr,t),Cn(n,t)}}function WU(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3ui(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(Rn(n,t))return;e.uniform3uiv(this.addr,t),Cn(n,t)}}function qU(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4ui(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(Rn(n,t))return;e.uniform4uiv(this.addr,t),Cn(n,t)}}function YU(e,t,n){let i=this.cache,s=n.allocateTextureUnit();i[0]!==s&&(e.uniform1i(this.addr,s),i[0]=s);let a;this.type===e.SAMPLER_2D_SHADOW?(EE.compareFunction=iT,a=EE):a=cT,n.setTexture2D(t||a,s)}function ZU(e,t,n){let i=this.cache,s=n.allocateTextureUnit();i[0]!==s&&(e.uniform1i(this.addr,s),i[0]=s),n.setTexture3D(t||hT,s)}function KU(e,t,n){let i=this.cache,s=n.allocateTextureUnit();i[0]!==s&&(e.uniform1i(this.addr,s),i[0]=s),n.setTextureCube(t||fT,s)}function jU(e,t,n){let i=this.cache,s=n.allocateTextureUnit();i[0]!==s&&(e.uniform1i(this.addr,s),i[0]=s),n.setTexture2DArray(t||uT,s)}function QU(e){switch(e){case 5126:return UU;case 35664:return LU;case 35665:return OU;case 35666:return IU;case 35674:return PU;case 35675:return zU;case 35676:return BU;case 5124:case 35670:return FU;case 35667:case 35671:return HU;case 35668:case 35672:return VU;case 35669:case 35673:return GU;case 5125:return kU;case 36294:return XU;case 36295:return WU;case 36296:return qU;case 35678:case 36198:case 36298:case 36306:case 35682:return YU;case 35679:case 36299:case 36307:return ZU;case 35680:case 36300:case 36308:case 36293:return KU;case 36289:case 36303:case 36311:case 36292:return jU}}function JU(e,t){e.uniform1fv(this.addr,t)}function $U(e,t){let n=cc(t,this.size,2);e.uniform2fv(this.addr,n)}function tL(e,t){let n=cc(t,this.size,3);e.uniform3fv(this.addr,n)}function eL(e,t){let n=cc(t,this.size,4);e.uniform4fv(this.addr,n)}function nL(e,t){let n=cc(t,this.size,4);e.uniformMatrix2fv(this.addr,!1,n)}function iL(e,t){let n=cc(t,this.size,9);e.uniformMatrix3fv(this.addr,!1,n)}function sL(e,t){let n=cc(t,this.size,16);e.uniformMatrix4fv(this.addr,!1,n)}function aL(e,t){e.uniform1iv(this.addr,t)}function rL(e,t){e.uniform2iv(this.addr,t)}function oL(e,t){e.uniform3iv(this.addr,t)}function lL(e,t){e.uniform4iv(this.addr,t)}function cL(e,t){e.uniform1uiv(this.addr,t)}function uL(e,t){e.uniform2uiv(this.addr,t)}function hL(e,t){e.uniform3uiv(this.addr,t)}function fL(e,t){e.uniform4uiv(this.addr,t)}function dL(e,t,n){let i=this.cache,s=t.length,a=Gd(n,s);Rn(i,a)||(e.uniform1iv(this.addr,a),Cn(i,a));for(let r=0;r!==s;++r)n.setTexture2D(t[r]||cT,a[r])}function pL(e,t,n){let i=this.cache,s=t.length,a=Gd(n,s);Rn(i,a)||(e.uniform1iv(this.addr,a),Cn(i,a));for(let r=0;r!==s;++r)n.setTexture3D(t[r]||hT,a[r])}function mL(e,t,n){let i=this.cache,s=t.length,a=Gd(n,s);Rn(i,a)||(e.uniform1iv(this.addr,a),Cn(i,a));for(let r=0;r!==s;++r)n.setTextureCube(t[r]||fT,a[r])}function gL(e,t,n){let i=this.cache,s=t.length,a=Gd(n,s);Rn(i,a)||(e.uniform1iv(this.addr,a),Cn(i,a));for(let r=0;r!==s;++r)n.setTexture2DArray(t[r]||uT,a[r])}function vL(e){switch(e){case 5126:return JU;case 35664:return $U;case 35665:return tL;case 35666:return eL;case 35674:return nL;case 35675:return iL;case 35676:return sL;case 5124:case 35670:return aL;case 35667:case 35671:return rL;case 35668:case 35672:return oL;case 35669:case 35673:return lL;case 5125:return cL;case 36294:return uL;case 36295:return hL;case 36296:return fL;case 35678:case 36198:case 36298:case 36306:case 35682:return dL;case 35679:case 36299:case 36307:return pL;case 35680:case 36300:case 36308:case 36293:return mL;case 36289:case 36303:case 36311:case 36292:return gL}}function DE(e,t){e.seq.push(t),e.map[t.id]=t}function yL(e,t,n){let i=e.name,s=i.length;for(jg.lastIndex=0;;){let a=jg.exec(i),r=jg.lastIndex,o=a[1],l=a[2]==="]",c=a[3];if(l&&(o=o|0),c===void 0||c==="["&&r+2===s){DE(n,c===void 0?new Vv(o,e,t):new Gv(o,e,t));break}else{let d=n.map[o];d===void 0&&(d=new kv(o),DE(n,d)),n=d}}}function NE(e,t,n){let i=e.createShader(t);return e.shaderSource(i,n),e.compileShader(i),i}function bL(e,t){let n=e.split(`
`),i=[],s=Math.max(t-6,0),a=Math.min(t+6,n.length);for(let r=s;r<a;r++){let o=r+1;i.push(`${o===t?">":" "} ${o}: ${n[r]}`)}return i.join(`
`)}function SL(e){let t=ze.getPrimaries(ze.workingColorSpace),n=ze.getPrimaries(e),i;switch(t===n?i="":t===yd&&n===vd?i="LinearDisplayP3ToLinearSRGB":t===vd&&n===yd&&(i="LinearSRGBToLinearDisplayP3"),e){case js:case Vd:return[i,"LinearTransferOETF"];case Xs:case my:return[i,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space:",e),[i,"LinearTransferOETF"]}}function UE(e,t,n){let i=e.getShaderParameter(t,e.COMPILE_STATUS),s=e.getShaderInfoLog(t).trim();if(i&&s==="")return"";let a=/ERROR: 0:(\d+)/.exec(s);if(a){let r=parseInt(a[1]);return n.toUpperCase()+`

`+s+`

`+bL(e.getShaderSource(t),r)}else return s}function ML(e,t){let n=SL(t);return`vec4 ${e}( vec4 value ) { return ${n[0]}( ${n[1]}( value ) ); }`}function EL(e,t){let n;switch(t){case LC:n="Linear";break;case OC:n="Reinhard";break;case IC:n="Cineon";break;case PC:n="ACESFilmic";break;case BC:n="AgX";break;case FC:n="Neutral";break;case zC:n="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",t),n="Linear"}return"vec3 "+e+"( vec3 color ) { return "+n+"ToneMapping( color ); }"}function TL(){ze.getLuminanceCoefficients(ad);let e=ad.x.toFixed(4),t=ad.y.toFixed(4),n=ad.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${e}, ${t}, ${n} );`,"	return dot( weights, rgb );","}"].join(`
`)}function AL(e){return[e.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",e.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Cu).join(`
`)}function wL(e){let t=[];for(let n in e){let i=e[n];i!==!1&&t.push("#define "+n+" "+i)}return t.join(`
`)}function RL(e,t){let n={},i=e.getProgramParameter(t,e.ACTIVE_ATTRIBUTES);for(let s=0;s<i;s++){let a=e.getActiveAttrib(t,s),r=a.name,o=1;a.type===e.FLOAT_MAT2&&(o=2),a.type===e.FLOAT_MAT3&&(o=3),a.type===e.FLOAT_MAT4&&(o=4),n[r]={type:a.type,location:e.getAttribLocation(t,r),locationSize:o}}return n}function Cu(e){return e!==""}function LE(e,t){let n=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return e.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,n).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function OE(e,t){return e.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}function Xv(e){return e.replace(CL,NL)}function NL(e,t){let n=ve[t];if(n===void 0){let i=DL.get(t);if(i!==void 0)n=ve[i],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,i);else throw new Error("Can not resolve #include <"+t+">")}return Xv(n)}function IE(e){return e.replace(UL,LL)}function LL(e,t,n,i){let s="";for(let a=parseInt(t);a<parseInt(n);a++)s+=i.replace(/\[\s*i\s*\]/g,"[ "+a+" ]").replace(/UNROLLED_LOOP_INDEX/g,a);return s}function PE(e){let t=`precision ${e.precision} float;
	precision ${e.precision} int;
	precision ${e.precision} sampler2D;
	precision ${e.precision} samplerCube;
	precision ${e.precision} sampler3D;
	precision ${e.precision} sampler2DArray;
	precision ${e.precision} sampler2DShadow;
	precision ${e.precision} samplerCubeShadow;
	precision ${e.precision} sampler2DArrayShadow;
	precision ${e.precision} isampler2D;
	precision ${e.precision} isampler3D;
	precision ${e.precision} isamplerCube;
	precision ${e.precision} isampler2DArray;
	precision ${e.precision} usampler2D;
	precision ${e.precision} usampler3D;
	precision ${e.precision} usamplerCube;
	precision ${e.precision} usampler2DArray;
	`;return e.precision==="highp"?t+=`
#define HIGH_PRECISION`:e.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:e.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}function OL(e){let t="SHADOWMAP_TYPE_BASIC";return e.shadowMapType===XE?t="SHADOWMAP_TYPE_PCF":e.shadowMapType===fC?t="SHADOWMAP_TYPE_PCF_SOFT":e.shadowMapType===Ea&&(t="SHADOWMAP_TYPE_VSM"),t}function IL(e){let t="ENVMAP_TYPE_CUBE";if(e.envMap)switch(e.envMapMode){case Jl:case $l:t="ENVMAP_TYPE_CUBE";break;case Hd:t="ENVMAP_TYPE_CUBE_UV";break}return t}function PL(e){let t="ENVMAP_MODE_REFLECTION";return e.envMap&&e.envMapMode===$l&&(t="ENVMAP_MODE_REFRACTION"),t}function zL(e){let t="ENVMAP_BLENDING_NONE";if(e.envMap)switch(e.combine){case WE:t="ENVMAP_BLENDING_MULTIPLY";break;case NC:t="ENVMAP_BLENDING_MIX";break;case UC:t="ENVMAP_BLENDING_ADD";break}return t}function BL(e){let t=e.envMapCubeUVHeight;if(t===null)return null;let n=Math.log2(t)-2,i=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,n),112)),texelHeight:i,maxMip:n}}function FL(e,t,n,i){let s=e.getContext(),a=n.defines,r=n.vertexShader,o=n.fragmentShader,l=OL(n),c=IL(n),u=PL(n),d=zL(n),h=BL(n),p=AL(n),g=wL(a),S=s.createProgram(),m,f,y=n.glslVersion?"#version "+n.glslVersion+`
`:"";n.isRawShaderMaterial?(m=["#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,g].filter(Cu).join(`
`),m.length>0&&(m+=`
`),f=["#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,g].filter(Cu).join(`
`),f.length>0&&(f+=`
`)):(m=[PE(n),"#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,g,n.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",n.batching?"#define USE_BATCHING":"",n.batchingColor?"#define USE_BATCHING_COLOR":"",n.instancing?"#define USE_INSTANCING":"",n.instancingColor?"#define USE_INSTANCING_COLOR":"",n.instancingMorph?"#define USE_INSTANCING_MORPH":"",n.useFog&&n.fog?"#define USE_FOG":"",n.useFog&&n.fogExp2?"#define FOG_EXP2":"",n.map?"#define USE_MAP":"",n.envMap?"#define USE_ENVMAP":"",n.envMap?"#define "+u:"",n.lightMap?"#define USE_LIGHTMAP":"",n.aoMap?"#define USE_AOMAP":"",n.bumpMap?"#define USE_BUMPMAP":"",n.normalMap?"#define USE_NORMALMAP":"",n.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",n.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",n.displacementMap?"#define USE_DISPLACEMENTMAP":"",n.emissiveMap?"#define USE_EMISSIVEMAP":"",n.anisotropy?"#define USE_ANISOTROPY":"",n.anisotropyMap?"#define USE_ANISOTROPYMAP":"",n.clearcoatMap?"#define USE_CLEARCOATMAP":"",n.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",n.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",n.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",n.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",n.specularMap?"#define USE_SPECULARMAP":"",n.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",n.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",n.roughnessMap?"#define USE_ROUGHNESSMAP":"",n.metalnessMap?"#define USE_METALNESSMAP":"",n.alphaMap?"#define USE_ALPHAMAP":"",n.alphaHash?"#define USE_ALPHAHASH":"",n.transmission?"#define USE_TRANSMISSION":"",n.transmissionMap?"#define USE_TRANSMISSIONMAP":"",n.thicknessMap?"#define USE_THICKNESSMAP":"",n.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",n.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",n.mapUv?"#define MAP_UV "+n.mapUv:"",n.alphaMapUv?"#define ALPHAMAP_UV "+n.alphaMapUv:"",n.lightMapUv?"#define LIGHTMAP_UV "+n.lightMapUv:"",n.aoMapUv?"#define AOMAP_UV "+n.aoMapUv:"",n.emissiveMapUv?"#define EMISSIVEMAP_UV "+n.emissiveMapUv:"",n.bumpMapUv?"#define BUMPMAP_UV "+n.bumpMapUv:"",n.normalMapUv?"#define NORMALMAP_UV "+n.normalMapUv:"",n.displacementMapUv?"#define DISPLACEMENTMAP_UV "+n.displacementMapUv:"",n.metalnessMapUv?"#define METALNESSMAP_UV "+n.metalnessMapUv:"",n.roughnessMapUv?"#define ROUGHNESSMAP_UV "+n.roughnessMapUv:"",n.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+n.anisotropyMapUv:"",n.clearcoatMapUv?"#define CLEARCOATMAP_UV "+n.clearcoatMapUv:"",n.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+n.clearcoatNormalMapUv:"",n.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+n.clearcoatRoughnessMapUv:"",n.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+n.iridescenceMapUv:"",n.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+n.iridescenceThicknessMapUv:"",n.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+n.sheenColorMapUv:"",n.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+n.sheenRoughnessMapUv:"",n.specularMapUv?"#define SPECULARMAP_UV "+n.specularMapUv:"",n.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+n.specularColorMapUv:"",n.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+n.specularIntensityMapUv:"",n.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+n.transmissionMapUv:"",n.thicknessMapUv?"#define THICKNESSMAP_UV "+n.thicknessMapUv:"",n.vertexTangents&&n.flatShading===!1?"#define USE_TANGENT":"",n.vertexColors?"#define USE_COLOR":"",n.vertexAlphas?"#define USE_COLOR_ALPHA":"",n.vertexUv1s?"#define USE_UV1":"",n.vertexUv2s?"#define USE_UV2":"",n.vertexUv3s?"#define USE_UV3":"",n.pointsUvs?"#define USE_POINTS_UV":"",n.flatShading?"#define FLAT_SHADED":"",n.skinning?"#define USE_SKINNING":"",n.morphTargets?"#define USE_MORPHTARGETS":"",n.morphNormals&&n.flatShading===!1?"#define USE_MORPHNORMALS":"",n.morphColors?"#define USE_MORPHCOLORS":"",n.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+n.morphTextureStride:"",n.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+n.morphTargetsCount:"",n.doubleSided?"#define DOUBLE_SIDED":"",n.flipSided?"#define FLIP_SIDED":"",n.shadowMapEnabled?"#define USE_SHADOWMAP":"",n.shadowMapEnabled?"#define "+l:"",n.sizeAttenuation?"#define USE_SIZEATTENUATION":"",n.numLightProbes>0?"#define USE_LIGHT_PROBES":"",n.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",n.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Cu).join(`
`),f=[PE(n),"#define SHADER_TYPE "+n.shaderType,"#define SHADER_NAME "+n.shaderName,g,n.useFog&&n.fog?"#define USE_FOG":"",n.useFog&&n.fogExp2?"#define FOG_EXP2":"",n.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",n.map?"#define USE_MAP":"",n.matcap?"#define USE_MATCAP":"",n.envMap?"#define USE_ENVMAP":"",n.envMap?"#define "+c:"",n.envMap?"#define "+u:"",n.envMap?"#define "+d:"",h?"#define CUBEUV_TEXEL_WIDTH "+h.texelWidth:"",h?"#define CUBEUV_TEXEL_HEIGHT "+h.texelHeight:"",h?"#define CUBEUV_MAX_MIP "+h.maxMip+".0":"",n.lightMap?"#define USE_LIGHTMAP":"",n.aoMap?"#define USE_AOMAP":"",n.bumpMap?"#define USE_BUMPMAP":"",n.normalMap?"#define USE_NORMALMAP":"",n.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",n.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",n.emissiveMap?"#define USE_EMISSIVEMAP":"",n.anisotropy?"#define USE_ANISOTROPY":"",n.anisotropyMap?"#define USE_ANISOTROPYMAP":"",n.clearcoat?"#define USE_CLEARCOAT":"",n.clearcoatMap?"#define USE_CLEARCOATMAP":"",n.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",n.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",n.dispersion?"#define USE_DISPERSION":"",n.iridescence?"#define USE_IRIDESCENCE":"",n.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",n.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",n.specularMap?"#define USE_SPECULARMAP":"",n.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",n.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",n.roughnessMap?"#define USE_ROUGHNESSMAP":"",n.metalnessMap?"#define USE_METALNESSMAP":"",n.alphaMap?"#define USE_ALPHAMAP":"",n.alphaTest?"#define USE_ALPHATEST":"",n.alphaHash?"#define USE_ALPHAHASH":"",n.sheen?"#define USE_SHEEN":"",n.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",n.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",n.transmission?"#define USE_TRANSMISSION":"",n.transmissionMap?"#define USE_TRANSMISSIONMAP":"",n.thicknessMap?"#define USE_THICKNESSMAP":"",n.vertexTangents&&n.flatShading===!1?"#define USE_TANGENT":"",n.vertexColors||n.instancingColor||n.batchingColor?"#define USE_COLOR":"",n.vertexAlphas?"#define USE_COLOR_ALPHA":"",n.vertexUv1s?"#define USE_UV1":"",n.vertexUv2s?"#define USE_UV2":"",n.vertexUv3s?"#define USE_UV3":"",n.pointsUvs?"#define USE_POINTS_UV":"",n.gradientMap?"#define USE_GRADIENTMAP":"",n.flatShading?"#define FLAT_SHADED":"",n.doubleSided?"#define DOUBLE_SIDED":"",n.flipSided?"#define FLIP_SIDED":"",n.shadowMapEnabled?"#define USE_SHADOWMAP":"",n.shadowMapEnabled?"#define "+l:"",n.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",n.numLightProbes>0?"#define USE_LIGHT_PROBES":"",n.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",n.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",n.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",n.toneMapping!==Mr?"#define TONE_MAPPING":"",n.toneMapping!==Mr?ve.tonemapping_pars_fragment:"",n.toneMapping!==Mr?EL("toneMapping",n.toneMapping):"",n.dithering?"#define DITHERING":"",n.opaque?"#define OPAQUE":"",ve.colorspace_pars_fragment,ML("linearToOutputTexel",n.outputColorSpace),TL(),n.useDepthPacking?"#define DEPTH_PACKING "+n.depthPacking:"",`
`].filter(Cu).join(`
`)),r=Xv(r),r=LE(r,n),r=OE(r,n),o=Xv(o),o=LE(o,n),o=OE(o,n),r=IE(r),o=IE(o),n.isRawShaderMaterial!==!0&&(y=`#version 300 es
`,m=[p,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,f=["#define varying in",n.glslVersion===$M?"":"layout(location = 0) out highp vec4 pc_fragColor;",n.glslVersion===$M?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+f);let _=y+m+r,b=y+f+o,D=NE(s,s.VERTEX_SHADER,_),R=NE(s,s.FRAGMENT_SHADER,b);s.attachShader(S,D),s.attachShader(S,R),n.index0AttributeName!==void 0?s.bindAttribLocation(S,0,n.index0AttributeName):n.morphTargets===!0&&s.bindAttribLocation(S,0,"position"),s.linkProgram(S);function A(M){if(e.debug.checkShaderErrors){let F=s.getProgramInfoLog(S).trim(),q=s.getShaderInfoLog(D).trim(),K=s.getShaderInfoLog(R).trim(),$=!0,B=!0;if(s.getProgramParameter(S,s.LINK_STATUS)===!1)if($=!1,typeof e.debug.onShaderError=="function")e.debug.onShaderError(s,S,D,R);else{let ct=UE(s,D,"vertex"),Z=UE(s,R,"fragment");console.error("THREE.WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(S,s.VALIDATE_STATUS)+`

Material Name: `+M.name+`
Material Type: `+M.type+`

Program Info Log: `+F+`
`+ct+`
`+Z)}else F!==""?console.warn("THREE.WebGLProgram: Program Info Log:",F):(q===""||K==="")&&(B=!1);B&&(M.diagnostics={runnable:$,programLog:F,vertexShader:{log:q,prefix:m},fragmentShader:{log:K,prefix:f}})}s.deleteShader(D),s.deleteShader(R),N=new Ql(s,S),et=RL(s,S)}let N;this.getUniforms=function(){return N===void 0&&A(this),N};let et;this.getAttributes=function(){return et===void 0&&A(this),et};let v=n.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return v===!1&&(v=s.getProgramParameter(S,_L)),v},this.destroy=function(){i.releaseStatesOfProgram(this),s.deleteProgram(S),this.program=void 0},this.type=n.shaderType,this.name=n.shaderName,this.id=xL++,this.cacheKey=t,this.usedTimes=1,this.program=S,this.vertexShader=D,this.fragmentShader=R,this}function VL(e,t,n,i,s,a,r){let o=new Md,l=new Wv,c=new Set,u=[],d=s.logarithmicDepthBuffer,h=s.reverseDepthBuffer,p=s.vertexTextures,g=s.precision,S={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function m(v){return c.add(v),v===0?"uv":`uv${v}`}function f(v,M,F,q,K){let $=q.fog,B=K.geometry,ct=v.isMeshStandardMaterial?q.environment:null,Z=(v.isMeshStandardMaterial?n:t).get(v.envMap||ct),wt=Z&&Z.mapping===Hd?Z.image.height:null,mt=S[v.type];v.precision!==null&&(g=s.getMaxPrecision(v.precision),g!==v.precision&&console.warn("THREE.WebGLProgram.getParameters:",v.precision,"not supported, using",g,"instead."));let ft=B.morphAttributes.position||B.morphAttributes.normal||B.morphAttributes.color,Ht=ft!==void 0?ft.length:0,ie=0;B.morphAttributes.position!==void 0&&(ie=1),B.morphAttributes.normal!==void 0&&(ie=2),B.morphAttributes.color!==void 0&&(ie=3);let nt,rt,Rt,St;if(mt){let Wt=Ws[mt];nt=Wt.vertexShader,rt=Wt.fragmentShader}else nt=v.vertexShader,rt=v.fragmentShader,l.update(v),Rt=l.getVertexShaderID(v),St=l.getFragmentShaderID(v);let Kt=e.getRenderTarget(),Nt=K.isInstancedMesh===!0,Vt=K.isBatchedMesh===!0,me=!!v.map,te=!!v.matcap,C=!!Z,sn=!!v.aoMap,ee=!!v.lightMap,ce=!!v.bumpMap,j=!!v.normalMap,ut=!!v.displacementMap,ot=!!v.emissiveMap,E=!!v.metalnessMap,x=!!v.roughnessMap,P=v.anisotropy>0,Q=v.clearcoat>0,tt=v.dispersion>0,J=v.iridescence>0,Ot=v.sheen>0,Mt=v.transmission>0,Et=P&&!!v.anisotropyMap,_e=Q&&!!v.clearcoatMap,vt=Q&&!!v.clearcoatNormalMap,Bt=Q&&!!v.clearcoatRoughnessMap,bt=J&&!!v.iridescenceMap,$t=J&&!!v.iridescenceThicknessMap,zt=Ot&&!!v.sheenColorMap,de=Ot&&!!v.sheenRoughnessMap,O=!!v.specularMap,k=!!v.specularColorMap,w=!!v.specularIntensityMap,V=Mt&&!!v.transmissionMap,L=Mt&&!!v.thicknessMap,G=!!v.gradientMap,it=!!v.alphaMap,lt=v.alphaTest>0,Tt=!!v.alphaHash,jt=!!v.extensions,Xt=Mr;v.toneMapped&&(Kt===null||Kt.isXRRenderTarget===!0)&&(Xt=e.toneMapping);let Ft={shaderID:mt,shaderType:v.type,shaderName:v.name,vertexShader:nt,fragmentShader:rt,defines:v.defines,customVertexShaderID:Rt,customFragmentShaderID:St,isRawShaderMaterial:v.isRawShaderMaterial===!0,glslVersion:v.glslVersion,precision:g,batching:Vt,batchingColor:Vt&&K._colorsTexture!==null,instancing:Nt,instancingColor:Nt&&K.instanceColor!==null,instancingMorph:Nt&&K.morphTexture!==null,supportsVertexTextures:p,outputColorSpace:Kt===null?e.outputColorSpace:Kt.isXRRenderTarget===!0?Kt.texture.colorSpace:js,alphaToCoverage:!!v.alphaToCoverage,map:me,matcap:te,envMap:C,envMapMode:C&&Z.mapping,envMapCubeUVHeight:wt,aoMap:sn,lightMap:ee,bumpMap:ce,normalMap:j,displacementMap:p&&ut,emissiveMap:ot,normalMapObjectSpace:j&&v.normalMapType===XC,normalMapTangentSpace:j&&v.normalMapType===kC,metalnessMap:E,roughnessMap:x,anisotropy:P,anisotropyMap:Et,clearcoat:Q,clearcoatMap:_e,clearcoatNormalMap:vt,clearcoatRoughnessMap:Bt,dispersion:tt,iridescence:J,iridescenceMap:bt,iridescenceThicknessMap:$t,sheen:Ot,sheenColorMap:zt,sheenRoughnessMap:de,specularMap:O,specularColorMap:k,specularIntensityMap:w,transmission:Mt,transmissionMap:V,thicknessMap:L,gradientMap:G,opaque:v.transparent===!1&&v.blending===Ys&&v.alphaToCoverage===!1,alphaMap:it,alphaTest:lt,alphaHash:Tt,combine:v.combine,mapUv:me&&m(v.map.channel),aoMapUv:sn&&m(v.aoMap.channel),lightMapUv:ee&&m(v.lightMap.channel),bumpMapUv:ce&&m(v.bumpMap.channel),normalMapUv:j&&m(v.normalMap.channel),displacementMapUv:ut&&m(v.displacementMap.channel),emissiveMapUv:ot&&m(v.emissiveMap.channel),metalnessMapUv:E&&m(v.metalnessMap.channel),roughnessMapUv:x&&m(v.roughnessMap.channel),anisotropyMapUv:Et&&m(v.anisotropyMap.channel),clearcoatMapUv:_e&&m(v.clearcoatMap.channel),clearcoatNormalMapUv:vt&&m(v.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Bt&&m(v.clearcoatRoughnessMap.channel),iridescenceMapUv:bt&&m(v.iridescenceMap.channel),iridescenceThicknessMapUv:$t&&m(v.iridescenceThicknessMap.channel),sheenColorMapUv:zt&&m(v.sheenColorMap.channel),sheenRoughnessMapUv:de&&m(v.sheenRoughnessMap.channel),specularMapUv:O&&m(v.specularMap.channel),specularColorMapUv:k&&m(v.specularColorMap.channel),specularIntensityMapUv:w&&m(v.specularIntensityMap.channel),transmissionMapUv:V&&m(v.transmissionMap.channel),thicknessMapUv:L&&m(v.thicknessMap.channel),alphaMapUv:it&&m(v.alphaMap.channel),vertexTangents:!!B.attributes.tangent&&(j||P),vertexColors:v.vertexColors,vertexAlphas:v.vertexColors===!0&&!!B.attributes.color&&B.attributes.color.itemSize===4,pointsUvs:K.isPoints===!0&&!!B.attributes.uv&&(me||it),fog:!!$,useFog:v.fog===!0,fogExp2:!!$&&$.isFogExp2,flatShading:v.flatShading===!0,sizeAttenuation:v.sizeAttenuation===!0,logarithmicDepthBuffer:d,reverseDepthBuffer:h,skinning:K.isSkinnedMesh===!0,morphTargets:B.morphAttributes.position!==void 0,morphNormals:B.morphAttributes.normal!==void 0,morphColors:B.morphAttributes.color!==void 0,morphTargetsCount:Ht,morphTextureStride:ie,numDirLights:M.directional.length,numPointLights:M.point.length,numSpotLights:M.spot.length,numSpotLightMaps:M.spotLightMap.length,numRectAreaLights:M.rectArea.length,numHemiLights:M.hemi.length,numDirLightShadows:M.directionalShadowMap.length,numPointLightShadows:M.pointShadowMap.length,numSpotLightShadows:M.spotShadowMap.length,numSpotLightShadowsWithMaps:M.numSpotLightShadowsWithMaps,numLightProbes:M.numLightProbes,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:v.dithering,shadowMapEnabled:e.shadowMap.enabled&&F.length>0,shadowMapType:e.shadowMap.type,toneMapping:Xt,decodeVideoTexture:me&&v.map.isVideoTexture===!0&&ze.getTransfer(v.map.colorSpace)===nn,premultipliedAlpha:v.premultipliedAlpha,doubleSided:v.side===ii,flipSided:v.side===Ti,useDepthPacking:v.depthPacking>=0,depthPacking:v.depthPacking||0,index0AttributeName:v.index0AttributeName,extensionClipCullDistance:jt&&v.extensions.clipCullDistance===!0&&i.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(jt&&v.extensions.multiDraw===!0||Vt)&&i.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:i.has("KHR_parallel_shader_compile"),customProgramCacheKey:v.customProgramCacheKey()};return Ft.vertexUv1s=c.has(1),Ft.vertexUv2s=c.has(2),Ft.vertexUv3s=c.has(3),c.clear(),Ft}function y(v){let M=[];if(v.shaderID?M.push(v.shaderID):(M.push(v.customVertexShaderID),M.push(v.customFragmentShaderID)),v.defines!==void 0)for(let F in v.defines)M.push(F),M.push(v.defines[F]);return v.isRawShaderMaterial===!1&&(_(M,v),b(M,v),M.push(e.outputColorSpace)),M.push(v.customProgramCacheKey),M.join()}function _(v,M){v.push(M.precision),v.push(M.outputColorSpace),v.push(M.envMapMode),v.push(M.envMapCubeUVHeight),v.push(M.mapUv),v.push(M.alphaMapUv),v.push(M.lightMapUv),v.push(M.aoMapUv),v.push(M.bumpMapUv),v.push(M.normalMapUv),v.push(M.displacementMapUv),v.push(M.emissiveMapUv),v.push(M.metalnessMapUv),v.push(M.roughnessMapUv),v.push(M.anisotropyMapUv),v.push(M.clearcoatMapUv),v.push(M.clearcoatNormalMapUv),v.push(M.clearcoatRoughnessMapUv),v.push(M.iridescenceMapUv),v.push(M.iridescenceThicknessMapUv),v.push(M.sheenColorMapUv),v.push(M.sheenRoughnessMapUv),v.push(M.specularMapUv),v.push(M.specularColorMapUv),v.push(M.specularIntensityMapUv),v.push(M.transmissionMapUv),v.push(M.thicknessMapUv),v.push(M.combine),v.push(M.fogExp2),v.push(M.sizeAttenuation),v.push(M.morphTargetsCount),v.push(M.morphAttributeCount),v.push(M.numDirLights),v.push(M.numPointLights),v.push(M.numSpotLights),v.push(M.numSpotLightMaps),v.push(M.numHemiLights),v.push(M.numRectAreaLights),v.push(M.numDirLightShadows),v.push(M.numPointLightShadows),v.push(M.numSpotLightShadows),v.push(M.numSpotLightShadowsWithMaps),v.push(M.numLightProbes),v.push(M.shadowMapType),v.push(M.toneMapping),v.push(M.numClippingPlanes),v.push(M.numClipIntersection),v.push(M.depthPacking)}function b(v,M){o.disableAll(),M.supportsVertexTextures&&o.enable(0),M.instancing&&o.enable(1),M.instancingColor&&o.enable(2),M.instancingMorph&&o.enable(3),M.matcap&&o.enable(4),M.envMap&&o.enable(5),M.normalMapObjectSpace&&o.enable(6),M.normalMapTangentSpace&&o.enable(7),M.clearcoat&&o.enable(8),M.iridescence&&o.enable(9),M.alphaTest&&o.enable(10),M.vertexColors&&o.enable(11),M.vertexAlphas&&o.enable(12),M.vertexUv1s&&o.enable(13),M.vertexUv2s&&o.enable(14),M.vertexUv3s&&o.enable(15),M.vertexTangents&&o.enable(16),M.anisotropy&&o.enable(17),M.alphaHash&&o.enable(18),M.batching&&o.enable(19),M.dispersion&&o.enable(20),M.batchingColor&&o.enable(21),v.push(o.mask),o.disableAll(),M.fog&&o.enable(0),M.useFog&&o.enable(1),M.flatShading&&o.enable(2),M.logarithmicDepthBuffer&&o.enable(3),M.reverseDepthBuffer&&o.enable(4),M.skinning&&o.enable(5),M.morphTargets&&o.enable(6),M.morphNormals&&o.enable(7),M.morphColors&&o.enable(8),M.premultipliedAlpha&&o.enable(9),M.shadowMapEnabled&&o.enable(10),M.doubleSided&&o.enable(11),M.flipSided&&o.enable(12),M.useDepthPacking&&o.enable(13),M.dithering&&o.enable(14),M.transmission&&o.enable(15),M.sheen&&o.enable(16),M.opaque&&o.enable(17),M.pointsUvs&&o.enable(18),M.decodeVideoTexture&&o.enable(19),M.alphaToCoverage&&o.enable(20),v.push(o.mask)}function D(v){let M=S[v.type],F;if(M){let q=Ws[M];F=lc.clone(q.uniforms)}else F=v.uniforms;return F}function R(v,M){let F;for(let q=0,K=u.length;q<K;q++){let $=u[q];if($.cacheKey===M){F=$,++F.usedTimes;break}}return F===void 0&&(F=new FL(e,M,v,a),u.push(F)),F}function A(v){if(--v.usedTimes===0){let M=u.indexOf(v);u[M]=u[u.length-1],u.pop(),v.destroy()}}function N(v){l.remove(v)}function et(){l.dispose()}return{getParameters:f,getProgramCacheKey:y,getUniforms:D,acquireProgram:R,releaseProgram:A,releaseShaderCache:N,programs:u,dispose:et}}function GL(){let e=new WeakMap;function t(r){return e.has(r)}function n(r){let o=e.get(r);return o===void 0&&(o={},e.set(r,o)),o}function i(r){e.delete(r)}function s(r,o,l){e.get(r)[o]=l}function a(){e=new WeakMap}return{has:t,get:n,remove:i,update:s,dispose:a}}function kL(e,t){return e.groupOrder!==t.groupOrder?e.groupOrder-t.groupOrder:e.renderOrder!==t.renderOrder?e.renderOrder-t.renderOrder:e.material.id!==t.material.id?e.material.id-t.material.id:e.z!==t.z?e.z-t.z:e.id-t.id}function zE(e,t){return e.groupOrder!==t.groupOrder?e.groupOrder-t.groupOrder:e.renderOrder!==t.renderOrder?e.renderOrder-t.renderOrder:e.z!==t.z?t.z-e.z:e.id-t.id}function BE(){let e=[],t=0,n=[],i=[],s=[];function a(){t=0,n.length=0,i.length=0,s.length=0}function r(d,h,p,g,S,m){let f=e[t];return f===void 0?(f={id:d.id,object:d,geometry:h,material:p,groupOrder:g,renderOrder:d.renderOrder,z:S,group:m},e[t]=f):(f.id=d.id,f.object=d,f.geometry=h,f.material=p,f.groupOrder=g,f.renderOrder=d.renderOrder,f.z=S,f.group=m),t++,f}function o(d,h,p,g,S,m){let f=r(d,h,p,g,S,m);p.transmission>0?i.push(f):p.transparent===!0?s.push(f):n.push(f)}function l(d,h,p,g,S,m){let f=r(d,h,p,g,S,m);p.transmission>0?i.unshift(f):p.transparent===!0?s.unshift(f):n.unshift(f)}function c(d,h){n.length>1&&n.sort(d||kL),i.length>1&&i.sort(h||zE),s.length>1&&s.sort(h||zE)}function u(){for(let d=t,h=e.length;d<h;d++){let p=e[d];if(p.id===null)break;p.id=null,p.object=null,p.geometry=null,p.material=null,p.group=null}}return{opaque:n,transmissive:i,transparent:s,init:a,push:o,unshift:l,finish:u,sort:c}}function XL(){let e=new WeakMap;function t(i,s){let a=e.get(i),r;return a===void 0?(r=new BE,e.set(i,[r])):s>=a.length?(r=new BE,a.push(r)):r=a[s],r}function n(){e=new WeakMap}return{get:t,dispose:n}}function WL(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case"DirectionalLight":n={direction:new W,color:new fe};break;case"SpotLight":n={position:new W,direction:new W,color:new fe,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":n={position:new W,color:new fe,distance:0,decay:0};break;case"HemisphereLight":n={direction:new W,skyColor:new fe,groundColor:new fe};break;case"RectAreaLight":n={color:new fe,position:new W,halfWidth:new W,halfHeight:new W};break}return e[t.id]=n,n}}}function qL(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case"DirectionalLight":n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Yt};break;case"SpotLight":n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Yt};break;case"PointLight":n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Yt,shadowCameraNear:1,shadowCameraFar:1e3};break}return e[t.id]=n,n}}}function ZL(e,t){return(t.castShadow?2:0)-(e.castShadow?2:0)+(t.map?1:0)-(e.map?1:0)}function KL(e){let t=new WL,n=qL(),i={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)i.probe.push(new W);let s=new W,a=new pn,r=new pn;function o(c){let u=0,d=0,h=0;for(let et=0;et<9;et++)i.probe[et].set(0,0,0);let p=0,g=0,S=0,m=0,f=0,y=0,_=0,b=0,D=0,R=0,A=0;c.sort(ZL);for(let et=0,v=c.length;et<v;et++){let M=c[et],F=M.color,q=M.intensity,K=M.distance,$=M.shadow&&M.shadow.map?M.shadow.map.texture:null;if(M.isAmbientLight)u+=F.r*q,d+=F.g*q,h+=F.b*q;else if(M.isLightProbe){for(let B=0;B<9;B++)i.probe[B].addScaledVector(M.sh.coefficients[B],q);A++}else if(M.isDirectionalLight){let B=t.get(M);if(B.color.copy(M.color).multiplyScalar(M.intensity),M.castShadow){let ct=M.shadow,Z=n.get(M);Z.shadowIntensity=ct.intensity,Z.shadowBias=ct.bias,Z.shadowNormalBias=ct.normalBias,Z.shadowRadius=ct.radius,Z.shadowMapSize=ct.mapSize,i.directionalShadow[p]=Z,i.directionalShadowMap[p]=$,i.directionalShadowMatrix[p]=M.shadow.matrix,y++}i.directional[p]=B,p++}else if(M.isSpotLight){let B=t.get(M);B.position.setFromMatrixPosition(M.matrixWorld),B.color.copy(F).multiplyScalar(q),B.distance=K,B.coneCos=Math.cos(M.angle),B.penumbraCos=Math.cos(M.angle*(1-M.penumbra)),B.decay=M.decay,i.spot[S]=B;let ct=M.shadow;if(M.map&&(i.spotLightMap[D]=M.map,D++,ct.updateMatrices(M),M.castShadow&&R++),i.spotLightMatrix[S]=ct.matrix,M.castShadow){let Z=n.get(M);Z.shadowIntensity=ct.intensity,Z.shadowBias=ct.bias,Z.shadowNormalBias=ct.normalBias,Z.shadowRadius=ct.radius,Z.shadowMapSize=ct.mapSize,i.spotShadow[S]=Z,i.spotShadowMap[S]=$,b++}S++}else if(M.isRectAreaLight){let B=t.get(M);B.color.copy(F).multiplyScalar(q),B.halfWidth.set(M.width*.5,0,0),B.halfHeight.set(0,M.height*.5,0),i.rectArea[m]=B,m++}else if(M.isPointLight){let B=t.get(M);if(B.color.copy(M.color).multiplyScalar(M.intensity),B.distance=M.distance,B.decay=M.decay,M.castShadow){let ct=M.shadow,Z=n.get(M);Z.shadowIntensity=ct.intensity,Z.shadowBias=ct.bias,Z.shadowNormalBias=ct.normalBias,Z.shadowRadius=ct.radius,Z.shadowMapSize=ct.mapSize,Z.shadowCameraNear=ct.camera.near,Z.shadowCameraFar=ct.camera.far,i.pointShadow[g]=Z,i.pointShadowMap[g]=$,i.pointShadowMatrix[g]=M.shadow.matrix,_++}i.point[g]=B,g++}else if(M.isHemisphereLight){let B=t.get(M);B.skyColor.copy(M.color).multiplyScalar(q),B.groundColor.copy(M.groundColor).multiplyScalar(q),i.hemi[f]=B,f++}}m>0&&(e.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=Lt.LTC_FLOAT_1,i.rectAreaLTC2=Lt.LTC_FLOAT_2):(i.rectAreaLTC1=Lt.LTC_HALF_1,i.rectAreaLTC2=Lt.LTC_HALF_2)),i.ambient[0]=u,i.ambient[1]=d,i.ambient[2]=h;let N=i.hash;(N.directionalLength!==p||N.pointLength!==g||N.spotLength!==S||N.rectAreaLength!==m||N.hemiLength!==f||N.numDirectionalShadows!==y||N.numPointShadows!==_||N.numSpotShadows!==b||N.numSpotMaps!==D||N.numLightProbes!==A)&&(i.directional.length=p,i.spot.length=S,i.rectArea.length=m,i.point.length=g,i.hemi.length=f,i.directionalShadow.length=y,i.directionalShadowMap.length=y,i.pointShadow.length=_,i.pointShadowMap.length=_,i.spotShadow.length=b,i.spotShadowMap.length=b,i.directionalShadowMatrix.length=y,i.pointShadowMatrix.length=_,i.spotLightMatrix.length=b+D-R,i.spotLightMap.length=D,i.numSpotLightShadowsWithMaps=R,i.numLightProbes=A,N.directionalLength=p,N.pointLength=g,N.spotLength=S,N.rectAreaLength=m,N.hemiLength=f,N.numDirectionalShadows=y,N.numPointShadows=_,N.numSpotShadows=b,N.numSpotMaps=D,N.numLightProbes=A,i.version=YL++)}function l(c,u){let d=0,h=0,p=0,g=0,S=0,m=u.matrixWorldInverse;for(let f=0,y=c.length;f<y;f++){let _=c[f];if(_.isDirectionalLight){let b=i.directional[d];b.direction.setFromMatrixPosition(_.matrixWorld),s.setFromMatrixPosition(_.target.matrixWorld),b.direction.sub(s),b.direction.transformDirection(m),d++}else if(_.isSpotLight){let b=i.spot[p];b.position.setFromMatrixPosition(_.matrixWorld),b.position.applyMatrix4(m),b.direction.setFromMatrixPosition(_.matrixWorld),s.setFromMatrixPosition(_.target.matrixWorld),b.direction.sub(s),b.direction.transformDirection(m),p++}else if(_.isRectAreaLight){let b=i.rectArea[g];b.position.setFromMatrixPosition(_.matrixWorld),b.position.applyMatrix4(m),r.identity(),a.copy(_.matrixWorld),a.premultiply(m),r.extractRotation(a),b.halfWidth.set(_.width*.5,0,0),b.halfHeight.set(0,_.height*.5,0),b.halfWidth.applyMatrix4(r),b.halfHeight.applyMatrix4(r),g++}else if(_.isPointLight){let b=i.point[h];b.position.setFromMatrixPosition(_.matrixWorld),b.position.applyMatrix4(m),h++}else if(_.isHemisphereLight){let b=i.hemi[S];b.direction.setFromMatrixPosition(_.matrixWorld),b.direction.transformDirection(m),S++}}}return{setup:o,setupView:l,state:i}}function FE(e){let t=new KL(e),n=[],i=[];function s(u){c.camera=u,n.length=0,i.length=0}function a(u){n.push(u)}function r(u){i.push(u)}function o(){t.setup(n)}function l(u){t.setupView(n,u)}let c={lightsArray:n,shadowsArray:i,camera:null,lights:t,transmissionRenderTarget:{}};return{init:s,state:c,setupLights:o,setupLightsView:l,pushLight:a,pushShadow:r}}function jL(e){let t=new WeakMap;function n(s,a=0){let r=t.get(s),o;return r===void 0?(o=new FE(e),t.set(s,[o])):a>=r.length?(o=new FE(e),r.push(o)):o=r[a],o}function i(){t=new WeakMap}return{get:n,dispose:i}}function $L(e,t,n){let i=new Rd,s=new Yt,a=new Yt,r=new ke,o=new Yv({depthPacking:GC}),l=new Zv,c={},u=n.maxTextureSize,d={[Zs]:Ti,[Ti]:Zs,[ii]:ii},h=new un({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Yt},radius:{value:4}},vertexShader:QL,fragmentShader:JL}),p=h.clone();p.defines.HORIZONTAL_PASS=1;let g=new En;g.setAttribute("position",new qe(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let S=new si(g,h),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=XE;let f=this.type;this.render=function(R,A,N){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||R.length===0)return;let et=e.getRenderTarget(),v=e.getActiveCubeFace(),M=e.getActiveMipmapLevel(),F=e.state;F.setBlending(qs),F.buffers.color.setClear(1,1,1,1),F.buffers.depth.setTest(!0),F.setScissorTest(!1);let q=f!==Ea&&this.type===Ea,K=f===Ea&&this.type!==Ea;for(let $=0,B=R.length;$<B;$++){let ct=R[$],Z=ct.shadow;if(Z===void 0){console.warn("THREE.WebGLShadowMap:",ct,"has no shadow.");continue}if(Z.autoUpdate===!1&&Z.needsUpdate===!1)continue;s.copy(Z.mapSize);let wt=Z.getFrameExtents();if(s.multiply(wt),a.copy(Z.mapSize),(s.x>u||s.y>u)&&(s.x>u&&(a.x=Math.floor(u/wt.x),s.x=a.x*wt.x,Z.mapSize.x=a.x),s.y>u&&(a.y=Math.floor(u/wt.y),s.y=a.y*wt.y,Z.mapSize.y=a.y)),Z.map===null||q===!0||K===!0){let ft=this.type!==Ea?{minFilter:is,magFilter:is}:{};Z.map!==null&&Z.map.dispose(),Z.map=new Zn(s.x,s.y,ft),Z.map.texture.name=ct.name+".shadowMap",Z.camera.updateProjectionMatrix()}e.setRenderTarget(Z.map),e.clear();let mt=Z.getViewportCount();for(let ft=0;ft<mt;ft++){let Ht=Z.getViewport(ft);r.set(a.x*Ht.x,a.y*Ht.y,a.x*Ht.z,a.y*Ht.w),F.viewport(r),Z.updateMatrices(ct,ft),i=Z.getFrustum(),b(A,N,Z.camera,ct,this.type)}Z.isPointLightShadow!==!0&&this.type===Ea&&y(Z,N),Z.needsUpdate=!1}f=this.type,m.needsUpdate=!1,e.setRenderTarget(et,v,M)};function y(R,A){let N=t.update(S);h.defines.VSM_SAMPLES!==R.blurSamples&&(h.defines.VSM_SAMPLES=R.blurSamples,p.defines.VSM_SAMPLES=R.blurSamples,h.needsUpdate=!0,p.needsUpdate=!0),R.mapPass===null&&(R.mapPass=new Zn(s.x,s.y)),h.uniforms.shadow_pass.value=R.map.texture,h.uniforms.resolution.value=R.mapSize,h.uniforms.radius.value=R.radius,e.setRenderTarget(R.mapPass),e.clear(),e.renderBufferDirect(A,null,N,h,S,null),p.uniforms.shadow_pass.value=R.mapPass.texture,p.uniforms.resolution.value=R.mapSize,p.uniforms.radius.value=R.radius,e.setRenderTarget(R.map),e.clear(),e.renderBufferDirect(A,null,N,p,S,null)}function _(R,A,N,et){let v=null,M=N.isPointLight===!0?R.customDistanceMaterial:R.customDepthMaterial;if(M!==void 0)v=M;else if(v=N.isPointLight===!0?l:o,e.localClippingEnabled&&A.clipShadows===!0&&Array.isArray(A.clippingPlanes)&&A.clippingPlanes.length!==0||A.displacementMap&&A.displacementScale!==0||A.alphaMap&&A.alphaTest>0||A.map&&A.alphaTest>0){let F=v.uuid,q=A.uuid,K=c[F];K===void 0&&(K={},c[F]=K);let $=K[q];$===void 0&&($=v.clone(),K[q]=$,A.addEventListener("dispose",D)),v=$}if(v.visible=A.visible,v.wireframe=A.wireframe,et===Ea?v.side=A.shadowSide!==null?A.shadowSide:A.side:v.side=A.shadowSide!==null?A.shadowSide:d[A.side],v.alphaMap=A.alphaMap,v.alphaTest=A.alphaTest,v.map=A.map,v.clipShadows=A.clipShadows,v.clippingPlanes=A.clippingPlanes,v.clipIntersection=A.clipIntersection,v.displacementMap=A.displacementMap,v.displacementScale=A.displacementScale,v.displacementBias=A.displacementBias,v.wireframeLinewidth=A.wireframeLinewidth,v.linewidth=A.linewidth,N.isPointLight===!0&&v.isMeshDistanceMaterial===!0){let F=e.properties.get(v);F.light=N}return v}function b(R,A,N,et,v){if(R.visible===!1)return;if(R.layers.test(A.layers)&&(R.isMesh||R.isLine||R.isPoints)&&(R.castShadow||R.receiveShadow&&v===Ea)&&(!R.frustumCulled||i.intersectsObject(R))){R.modelViewMatrix.multiplyMatrices(N.matrixWorldInverse,R.matrixWorld);let q=t.update(R),K=R.material;if(Array.isArray(K)){let $=q.groups;for(let B=0,ct=$.length;B<ct;B++){let Z=$[B],wt=K[Z.materialIndex];if(wt&&wt.visible){let mt=_(R,wt,et,v);R.onBeforeShadow(e,R,A,N,q,mt,Z),e.renderBufferDirect(N,null,q,mt,R,Z),R.onAfterShadow(e,R,A,N,q,mt,Z)}}}else if(K.visible){let $=_(R,K,et,v);R.onBeforeShadow(e,R,A,N,q,$,null),e.renderBufferDirect(N,null,q,$,R,null),R.onAfterShadow(e,R,A,N,q,$,null)}}let F=R.children;for(let q=0,K=F.length;q<K;q++)b(F[q],A,N,et,v)}function D(R){R.target.removeEventListener("dispose",D);for(let N in c){let et=c[N],v=R.target.uuid;v in et&&(et[v].dispose(),delete et[v])}}}function eO(e){function t(){let w=!1,V=new ke,L=null,G=new ke(0,0,0,0);return{setMask:function(it){L!==it&&!w&&(e.colorMask(it,it,it,it),L=it)},setLocked:function(it){w=it},setClear:function(it,lt,Tt,jt,Xt){Xt===!0&&(it*=jt,lt*=jt,Tt*=jt),V.set(it,lt,Tt,jt),G.equals(V)===!1&&(e.clearColor(it,lt,Tt,jt),G.copy(V))},reset:function(){w=!1,L=null,G.set(-1,0,0,0)}}}function n(){let w=!1,V=!1,L=null,G=null,it=null;return{setReversed:function(lt){V=lt},setTest:function(lt){lt?Rt(e.DEPTH_TEST):St(e.DEPTH_TEST)},setMask:function(lt){L!==lt&&!w&&(e.depthMask(lt),L=lt)},setFunc:function(lt){if(V&&(lt=tO[lt]),G!==lt){switch(lt){case $g:e.depthFunc(e.NEVER);break;case tv:e.depthFunc(e.ALWAYS);break;case ev:e.depthFunc(e.LESS);break;case Ks:e.depthFunc(e.LEQUAL);break;case nv:e.depthFunc(e.EQUAL);break;case iv:e.depthFunc(e.GEQUAL);break;case Er:e.depthFunc(e.GREATER);break;case sv:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}G=lt}},setLocked:function(lt){w=lt},setClear:function(lt){it!==lt&&(e.clearDepth(lt),it=lt)},reset:function(){w=!1,L=null,G=null,it=null}}}function i(){let w=!1,V=null,L=null,G=null,it=null,lt=null,Tt=null,jt=null,Xt=null;return{setTest:function(Ft){w||(Ft?Rt(e.STENCIL_TEST):St(e.STENCIL_TEST))},setMask:function(Ft){V!==Ft&&!w&&(e.stencilMask(Ft),V=Ft)},setFunc:function(Ft,Wt,Ee){(L!==Ft||G!==Wt||it!==Ee)&&(e.stencilFunc(Ft,Wt,Ee),L=Ft,G=Wt,it=Ee)},setOp:function(Ft,Wt,Ee){(lt!==Ft||Tt!==Wt||jt!==Ee)&&(e.stencilOp(Ft,Wt,Ee),lt=Ft,Tt=Wt,jt=Ee)},setLocked:function(Ft){w=Ft},setClear:function(Ft){Xt!==Ft&&(e.clearStencil(Ft),Xt=Ft)},reset:function(){w=!1,V=null,L=null,G=null,it=null,lt=null,Tt=null,jt=null,Xt=null}}}let s=new t,a=new n,r=new i,o=new WeakMap,l=new WeakMap,c={},u={},d=new WeakMap,h=[],p=null,g=!1,S=null,m=null,f=null,y=null,_=null,b=null,D=null,R=new fe(0,0,0),A=0,N=!1,et=null,v=null,M=null,F=null,q=null,K=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS),$=!1,B=0,ct=e.getParameter(e.VERSION);ct.indexOf("WebGL")!==-1?(B=parseFloat(/^WebGL (\d)/.exec(ct)[1]),$=B>=1):ct.indexOf("OpenGL ES")!==-1&&(B=parseFloat(/^OpenGL ES (\d)/.exec(ct)[1]),$=B>=2);let Z=null,wt={},mt=e.getParameter(e.SCISSOR_BOX),ft=e.getParameter(e.VIEWPORT),Ht=new ke().fromArray(mt),ie=new ke().fromArray(ft);function nt(w,V,L,G){let it=new Uint8Array(4),lt=e.createTexture();e.bindTexture(w,lt),e.texParameteri(w,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(w,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let Tt=0;Tt<L;Tt++)w===e.TEXTURE_3D||w===e.TEXTURE_2D_ARRAY?e.texImage3D(V,0,e.RGBA,1,1,G,0,e.RGBA,e.UNSIGNED_BYTE,it):e.texImage2D(V+Tt,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,it);return lt}let rt={};rt[e.TEXTURE_2D]=nt(e.TEXTURE_2D,e.TEXTURE_2D,1),rt[e.TEXTURE_CUBE_MAP]=nt(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),rt[e.TEXTURE_2D_ARRAY]=nt(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),rt[e.TEXTURE_3D]=nt(e.TEXTURE_3D,e.TEXTURE_3D,1,1),s.setClear(0,0,0,1),a.setClear(1),r.setClear(0),Rt(e.DEPTH_TEST),a.setFunc(Ks),ee(!1),ce(WM),Rt(e.CULL_FACE),C(qs);function Rt(w){c[w]!==!0&&(e.enable(w),c[w]=!0)}function St(w){c[w]!==!1&&(e.disable(w),c[w]=!1)}function Kt(w,V){return u[w]!==V?(e.bindFramebuffer(w,V),u[w]=V,w===e.DRAW_FRAMEBUFFER&&(u[e.FRAMEBUFFER]=V),w===e.FRAMEBUFFER&&(u[e.DRAW_FRAMEBUFFER]=V),!0):!1}function Nt(w,V){let L=h,G=!1;if(w){L=d.get(V),L===void 0&&(L=[],d.set(V,L));let it=w.textures;if(L.length!==it.length||L[0]!==e.COLOR_ATTACHMENT0){for(let lt=0,Tt=it.length;lt<Tt;lt++)L[lt]=e.COLOR_ATTACHMENT0+lt;L.length=it.length,G=!0}}else L[0]!==e.BACK&&(L[0]=e.BACK,G=!0);G&&e.drawBuffers(L)}function Vt(w){return p!==w?(e.useProgram(w),p=w,!0):!1}let me={[ro]:e.FUNC_ADD,[pC]:e.FUNC_SUBTRACT,[mC]:e.FUNC_REVERSE_SUBTRACT};me[gC]=e.MIN,me[vC]=e.MAX;let te={[yC]:e.ZERO,[_C]:e.ONE,[xC]:e.SRC_COLOR,[Qg]:e.SRC_ALPHA,[AC]:e.SRC_ALPHA_SATURATE,[EC]:e.DST_COLOR,[SC]:e.DST_ALPHA,[bC]:e.ONE_MINUS_SRC_COLOR,[Jg]:e.ONE_MINUS_SRC_ALPHA,[TC]:e.ONE_MINUS_DST_COLOR,[MC]:e.ONE_MINUS_DST_ALPHA,[wC]:e.CONSTANT_COLOR,[RC]:e.ONE_MINUS_CONSTANT_COLOR,[CC]:e.CONSTANT_ALPHA,[DC]:e.ONE_MINUS_CONSTANT_ALPHA};function C(w,V,L,G,it,lt,Tt,jt,Xt,Ft){if(w===qs){g===!0&&(St(e.BLEND),g=!1);return}if(g===!1&&(Rt(e.BLEND),g=!0),w!==dC){if(w!==S||Ft!==N){if((m!==ro||_!==ro)&&(e.blendEquation(e.FUNC_ADD),m=ro,_=ro),Ft)switch(w){case Ys:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case wa:e.blendFunc(e.ONE,e.ONE);break;case qM:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case YM:e.blendFuncSeparate(e.ZERO,e.SRC_COLOR,e.ZERO,e.SRC_ALPHA);break;default:console.error("THREE.WebGLState: Invalid blending: ",w);break}else switch(w){case Ys:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case wa:e.blendFunc(e.SRC_ALPHA,e.ONE);break;case qM:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case YM:e.blendFunc(e.ZERO,e.SRC_COLOR);break;default:console.error("THREE.WebGLState: Invalid blending: ",w);break}f=null,y=null,b=null,D=null,R.set(0,0,0),A=0,S=w,N=Ft}return}it=it||V,lt=lt||L,Tt=Tt||G,(V!==m||it!==_)&&(e.blendEquationSeparate(me[V],me[it]),m=V,_=it),(L!==f||G!==y||lt!==b||Tt!==D)&&(e.blendFuncSeparate(te[L],te[G],te[lt],te[Tt]),f=L,y=G,b=lt,D=Tt),(jt.equals(R)===!1||Xt!==A)&&(e.blendColor(jt.r,jt.g,jt.b,Xt),R.copy(jt),A=Xt),S=w,N=!1}function sn(w,V){w.side===ii?St(e.CULL_FACE):Rt(e.CULL_FACE);let L=w.side===Ti;V&&(L=!L),ee(L),w.blending===Ys&&w.transparent===!1?C(qs):C(w.blending,w.blendEquation,w.blendSrc,w.blendDst,w.blendEquationAlpha,w.blendSrcAlpha,w.blendDstAlpha,w.blendColor,w.blendAlpha,w.premultipliedAlpha),a.setFunc(w.depthFunc),a.setTest(w.depthTest),a.setMask(w.depthWrite),s.setMask(w.colorWrite);let G=w.stencilWrite;r.setTest(G),G&&(r.setMask(w.stencilWriteMask),r.setFunc(w.stencilFunc,w.stencilRef,w.stencilFuncMask),r.setOp(w.stencilFail,w.stencilZFail,w.stencilZPass)),ut(w.polygonOffset,w.polygonOffsetFactor,w.polygonOffsetUnits),w.alphaToCoverage===!0?Rt(e.SAMPLE_ALPHA_TO_COVERAGE):St(e.SAMPLE_ALPHA_TO_COVERAGE)}function ee(w){et!==w&&(w?e.frontFace(e.CW):e.frontFace(e.CCW),et=w)}function ce(w){w!==uC?(Rt(e.CULL_FACE),w!==v&&(w===WM?e.cullFace(e.BACK):w===hC?e.cullFace(e.FRONT):e.cullFace(e.FRONT_AND_BACK))):St(e.CULL_FACE),v=w}function j(w){w!==M&&($&&e.lineWidth(w),M=w)}function ut(w,V,L){w?(Rt(e.POLYGON_OFFSET_FILL),(F!==V||q!==L)&&(e.polygonOffset(V,L),F=V,q=L)):St(e.POLYGON_OFFSET_FILL)}function ot(w){w?Rt(e.SCISSOR_TEST):St(e.SCISSOR_TEST)}function E(w){w===void 0&&(w=e.TEXTURE0+K-1),Z!==w&&(e.activeTexture(w),Z=w)}function x(w,V,L){L===void 0&&(Z===null?L=e.TEXTURE0+K-1:L=Z);let G=wt[L];G===void 0&&(G={type:void 0,texture:void 0},wt[L]=G),(G.type!==w||G.texture!==V)&&(Z!==L&&(e.activeTexture(L),Z=L),e.bindTexture(w,V||rt[w]),G.type=w,G.texture=V)}function P(){let w=wt[Z];w!==void 0&&w.type!==void 0&&(e.bindTexture(w.type,null),w.type=void 0,w.texture=void 0)}function Q(){try{e.compressedTexImage2D.apply(e,arguments)}catch(w){console.error("THREE.WebGLState:",w)}}function tt(){try{e.compressedTexImage3D.apply(e,arguments)}catch(w){console.error("THREE.WebGLState:",w)}}function J(){try{e.texSubImage2D.apply(e,arguments)}catch(w){console.error("THREE.WebGLState:",w)}}function Ot(){try{e.texSubImage3D.apply(e,arguments)}catch(w){console.error("THREE.WebGLState:",w)}}function Mt(){try{e.compressedTexSubImage2D.apply(e,arguments)}catch(w){console.error("THREE.WebGLState:",w)}}function Et(){try{e.compressedTexSubImage3D.apply(e,arguments)}catch(w){console.error("THREE.WebGLState:",w)}}function _e(){try{e.texStorage2D.apply(e,arguments)}catch(w){console.error("THREE.WebGLState:",w)}}function vt(){try{e.texStorage3D.apply(e,arguments)}catch(w){console.error("THREE.WebGLState:",w)}}function Bt(){try{e.texImage2D.apply(e,arguments)}catch(w){console.error("THREE.WebGLState:",w)}}function bt(){try{e.texImage3D.apply(e,arguments)}catch(w){console.error("THREE.WebGLState:",w)}}function $t(w){Ht.equals(w)===!1&&(e.scissor(w.x,w.y,w.z,w.w),Ht.copy(w))}function zt(w){ie.equals(w)===!1&&(e.viewport(w.x,w.y,w.z,w.w),ie.copy(w))}function de(w,V){let L=l.get(V);L===void 0&&(L=new WeakMap,l.set(V,L));let G=L.get(w);G===void 0&&(G=e.getUniformBlockIndex(V,w.name),L.set(w,G))}function O(w,V){let G=l.get(V).get(w);o.get(V)!==G&&(e.uniformBlockBinding(V,G,w.__bindingPointIndex),o.set(V,G))}function k(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),c={},Z=null,wt={},u={},d=new WeakMap,h=[],p=null,g=!1,S=null,m=null,f=null,y=null,_=null,b=null,D=null,R=new fe(0,0,0),A=0,N=!1,et=null,v=null,M=null,F=null,q=null,Ht.set(0,0,e.canvas.width,e.canvas.height),ie.set(0,0,e.canvas.width,e.canvas.height),s.reset(),a.reset(),r.reset()}return{buffers:{color:s,depth:a,stencil:r},enable:Rt,disable:St,bindFramebuffer:Kt,drawBuffers:Nt,useProgram:Vt,setBlending:C,setMaterial:sn,setFlipSided:ee,setCullFace:ce,setLineWidth:j,setPolygonOffset:ut,setScissorTest:ot,activeTexture:E,bindTexture:x,unbindTexture:P,compressedTexImage2D:Q,compressedTexImage3D:tt,texImage2D:Bt,texImage3D:bt,updateUBOMapping:de,uniformBlockBinding:O,texStorage2D:_e,texStorage3D:vt,texSubImage2D:J,texSubImage3D:Ot,compressedTexSubImage2D:Mt,compressedTexSubImage3D:Et,scissor:$t,viewport:zt,reset:k}}function HE(e,t,n,i){let s=nO(i);switch(n){case jE:return e*t;case JE:return e*t;case $E:return e*t*2;case tT:return e*t/s.components*s.byteLength;case fy:return e*t/s.components*s.byteLength;case eT:return e*t*2/s.components*s.byteLength;case dy:return e*t*2/s.components*s.byteLength;case QE:return e*t*3/s.components*s.byteLength;case xs:return e*t*4/s.components*s.byteLength;case py:return e*t*4/s.components*s.byteLength;case cd:case ud:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case hd:case fd:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case uv:case fv:return Math.max(e,16)*Math.max(t,8)/4;case cv:case hv:return Math.max(e,8)*Math.max(t,8)/2;case dv:case pv:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case mv:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case gv:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case vv:return Math.floor((e+4)/5)*Math.floor((t+3)/4)*16;case yv:return Math.floor((e+4)/5)*Math.floor((t+4)/5)*16;case _v:return Math.floor((e+5)/6)*Math.floor((t+4)/5)*16;case xv:return Math.floor((e+5)/6)*Math.floor((t+5)/6)*16;case bv:return Math.floor((e+7)/8)*Math.floor((t+4)/5)*16;case Sv:return Math.floor((e+7)/8)*Math.floor((t+5)/6)*16;case Mv:return Math.floor((e+7)/8)*Math.floor((t+7)/8)*16;case Ev:return Math.floor((e+9)/10)*Math.floor((t+4)/5)*16;case Tv:return Math.floor((e+9)/10)*Math.floor((t+5)/6)*16;case Av:return Math.floor((e+9)/10)*Math.floor((t+7)/8)*16;case wv:return Math.floor((e+9)/10)*Math.floor((t+9)/10)*16;case Rv:return Math.floor((e+11)/12)*Math.floor((t+9)/10)*16;case Cv:return Math.floor((e+11)/12)*Math.floor((t+11)/12)*16;case dd:case Dv:case Nv:return Math.ceil(e/4)*Math.ceil(t/4)*16;case nT:case Uv:return Math.ceil(e/4)*Math.ceil(t/4)*8;case Lv:case Ov:return Math.ceil(e/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${n} format.`)}function nO(e){switch(e){case bs:case YE:return{byteLength:1,components:1};case Lu:case ZE:case Es:return{byteLength:2,components:1};case uy:case hy:return{byteLength:2,components:4};case ho:case cy:case Ta:return{byteLength:4,components:1};case KE:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${e}.`)}function iO(e,t,n,i,s,a,r){let o=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new Yt,u=new WeakMap,d,h=new WeakMap,p=!1;try{p=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(E,x){return p?new OffscreenCanvas(E,x):xd("canvas")}function S(E,x,P){let Q=1,tt=ot(E);if((tt.width>P||tt.height>P)&&(Q=P/Math.max(tt.width,tt.height)),Q<1)if(typeof HTMLImageElement<"u"&&E instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&E instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&E instanceof ImageBitmap||typeof VideoFrame<"u"&&E instanceof VideoFrame){let J=Math.floor(Q*tt.width),Ot=Math.floor(Q*tt.height);d===void 0&&(d=g(J,Ot));let Mt=x?g(J,Ot):d;return Mt.width=J,Mt.height=Ot,Mt.getContext("2d").drawImage(E,0,0,J,Ot),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+tt.width+"x"+tt.height+") to ("+J+"x"+Ot+")."),Mt}else return"data"in E&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+tt.width+"x"+tt.height+")."),E;return E}function m(E){return E.generateMipmaps&&E.minFilter!==is&&E.minFilter!==_s}function f(E){e.generateMipmap(E)}function y(E,x,P,Q,tt=!1){if(E!==null){if(e[E]!==void 0)return e[E];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+E+"'")}let J=x;if(x===e.RED&&(P===e.FLOAT&&(J=e.R32F),P===e.HALF_FLOAT&&(J=e.R16F),P===e.UNSIGNED_BYTE&&(J=e.R8)),x===e.RED_INTEGER&&(P===e.UNSIGNED_BYTE&&(J=e.R8UI),P===e.UNSIGNED_SHORT&&(J=e.R16UI),P===e.UNSIGNED_INT&&(J=e.R32UI),P===e.BYTE&&(J=e.R8I),P===e.SHORT&&(J=e.R16I),P===e.INT&&(J=e.R32I)),x===e.RG&&(P===e.FLOAT&&(J=e.RG32F),P===e.HALF_FLOAT&&(J=e.RG16F),P===e.UNSIGNED_BYTE&&(J=e.RG8)),x===e.RG_INTEGER&&(P===e.UNSIGNED_BYTE&&(J=e.RG8UI),P===e.UNSIGNED_SHORT&&(J=e.RG16UI),P===e.UNSIGNED_INT&&(J=e.RG32UI),P===e.BYTE&&(J=e.RG8I),P===e.SHORT&&(J=e.RG16I),P===e.INT&&(J=e.RG32I)),x===e.RGB_INTEGER&&(P===e.UNSIGNED_BYTE&&(J=e.RGB8UI),P===e.UNSIGNED_SHORT&&(J=e.RGB16UI),P===e.UNSIGNED_INT&&(J=e.RGB32UI),P===e.BYTE&&(J=e.RGB8I),P===e.SHORT&&(J=e.RGB16I),P===e.INT&&(J=e.RGB32I)),x===e.RGBA_INTEGER&&(P===e.UNSIGNED_BYTE&&(J=e.RGBA8UI),P===e.UNSIGNED_SHORT&&(J=e.RGBA16UI),P===e.UNSIGNED_INT&&(J=e.RGBA32UI),P===e.BYTE&&(J=e.RGBA8I),P===e.SHORT&&(J=e.RGBA16I),P===e.INT&&(J=e.RGBA32I)),x===e.RGB&&P===e.UNSIGNED_INT_5_9_9_9_REV&&(J=e.RGB9_E5),x===e.RGBA){let Ot=tt?gd:ze.getTransfer(Q);P===e.FLOAT&&(J=e.RGBA32F),P===e.HALF_FLOAT&&(J=e.RGBA16F),P===e.UNSIGNED_BYTE&&(J=Ot===nn?e.SRGB8_ALPHA8:e.RGBA8),P===e.UNSIGNED_SHORT_4_4_4_4&&(J=e.RGBA4),P===e.UNSIGNED_SHORT_5_5_5_1&&(J=e.RGB5_A1)}return(J===e.R16F||J===e.R32F||J===e.RG16F||J===e.RG32F||J===e.RGBA16F||J===e.RGBA32F)&&t.get("EXT_color_buffer_float"),J}function _(E,x){let P;return E?x===null||x===ho||x===tc?P=e.DEPTH24_STENCIL8:x===Ta?P=e.DEPTH32F_STENCIL8:x===Lu&&(P=e.DEPTH24_STENCIL8,console.warn("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):x===null||x===ho||x===tc?P=e.DEPTH_COMPONENT24:x===Ta?P=e.DEPTH_COMPONENT32F:x===Lu&&(P=e.DEPTH_COMPONENT16),P}function b(E,x){return m(E)===!0||E.isFramebufferTexture&&E.minFilter!==is&&E.minFilter!==_s?Math.log2(Math.max(x.width,x.height))+1:E.mipmaps!==void 0&&E.mipmaps.length>0?E.mipmaps.length:E.isCompressedTexture&&Array.isArray(E.image)?x.mipmaps.length:1}function D(E){let x=E.target;x.removeEventListener("dispose",D),A(x),x.isVideoTexture&&u.delete(x)}function R(E){let x=E.target;x.removeEventListener("dispose",R),et(x)}function A(E){let x=i.get(E);if(x.__webglInit===void 0)return;let P=E.source,Q=h.get(P);if(Q){let tt=Q[x.__cacheKey];tt.usedTimes--,tt.usedTimes===0&&N(E),Object.keys(Q).length===0&&h.delete(P)}i.remove(E)}function N(E){let x=i.get(E);e.deleteTexture(x.__webglTexture);let P=E.source,Q=h.get(P);delete Q[x.__cacheKey],r.memory.textures--}function et(E){let x=i.get(E);if(E.depthTexture&&E.depthTexture.dispose(),E.isWebGLCubeRenderTarget)for(let Q=0;Q<6;Q++){if(Array.isArray(x.__webglFramebuffer[Q]))for(let tt=0;tt<x.__webglFramebuffer[Q].length;tt++)e.deleteFramebuffer(x.__webglFramebuffer[Q][tt]);else e.deleteFramebuffer(x.__webglFramebuffer[Q]);x.__webglDepthbuffer&&e.deleteRenderbuffer(x.__webglDepthbuffer[Q])}else{if(Array.isArray(x.__webglFramebuffer))for(let Q=0;Q<x.__webglFramebuffer.length;Q++)e.deleteFramebuffer(x.__webglFramebuffer[Q]);else e.deleteFramebuffer(x.__webglFramebuffer);if(x.__webglDepthbuffer&&e.deleteRenderbuffer(x.__webglDepthbuffer),x.__webglMultisampledFramebuffer&&e.deleteFramebuffer(x.__webglMultisampledFramebuffer),x.__webglColorRenderbuffer)for(let Q=0;Q<x.__webglColorRenderbuffer.length;Q++)x.__webglColorRenderbuffer[Q]&&e.deleteRenderbuffer(x.__webglColorRenderbuffer[Q]);x.__webglDepthRenderbuffer&&e.deleteRenderbuffer(x.__webglDepthRenderbuffer)}let P=E.textures;for(let Q=0,tt=P.length;Q<tt;Q++){let J=i.get(P[Q]);J.__webglTexture&&(e.deleteTexture(J.__webglTexture),r.memory.textures--),i.remove(P[Q])}i.remove(E)}let v=0;function M(){v=0}function F(){let E=v;return E>=s.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+E+" texture units while this GPU supports only "+s.maxTextures),v+=1,E}function q(E){let x=[];return x.push(E.wrapS),x.push(E.wrapT),x.push(E.wrapR||0),x.push(E.magFilter),x.push(E.minFilter),x.push(E.anisotropy),x.push(E.internalFormat),x.push(E.format),x.push(E.type),x.push(E.generateMipmaps),x.push(E.premultiplyAlpha),x.push(E.flipY),x.push(E.unpackAlignment),x.push(E.colorSpace),x.join()}function K(E,x){let P=i.get(E);if(E.isVideoTexture&&j(E),E.isRenderTargetTexture===!1&&E.version>0&&P.__version!==E.version){let Q=E.image;if(Q===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(Q.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{ie(P,E,x);return}}n.bindTexture(e.TEXTURE_2D,P.__webglTexture,e.TEXTURE0+x)}function $(E,x){let P=i.get(E);if(E.version>0&&P.__version!==E.version){ie(P,E,x);return}n.bindTexture(e.TEXTURE_2D_ARRAY,P.__webglTexture,e.TEXTURE0+x)}function B(E,x){let P=i.get(E);if(E.version>0&&P.__version!==E.version){ie(P,E,x);return}n.bindTexture(e.TEXTURE_3D,P.__webglTexture,e.TEXTURE0+x)}function ct(E,x){let P=i.get(E);if(E.version>0&&P.__version!==E.version){nt(P,E,x);return}n.bindTexture(e.TEXTURE_CUBE_MAP,P.__webglTexture,e.TEXTURE0+x)}let Z={[ov]:e.REPEAT,[co]:e.CLAMP_TO_EDGE,[lv]:e.MIRRORED_REPEAT},wt={[is]:e.NEAREST,[HC]:e.NEAREST_MIPMAP_NEAREST,[Ff]:e.NEAREST_MIPMAP_LINEAR,[_s]:e.LINEAR,[Sg]:e.LINEAR_MIPMAP_NEAREST,[uo]:e.LINEAR_MIPMAP_LINEAR},mt={[WC]:e.NEVER,[QC]:e.ALWAYS,[qC]:e.LESS,[iT]:e.LEQUAL,[YC]:e.EQUAL,[jC]:e.GEQUAL,[ZC]:e.GREATER,[KC]:e.NOTEQUAL};function ft(E,x){if(x.type===Ta&&t.has("OES_texture_float_linear")===!1&&(x.magFilter===_s||x.magFilter===Sg||x.magFilter===Ff||x.magFilter===uo||x.minFilter===_s||x.minFilter===Sg||x.minFilter===Ff||x.minFilter===uo)&&console.warn("THREE.WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),e.texParameteri(E,e.TEXTURE_WRAP_S,Z[x.wrapS]),e.texParameteri(E,e.TEXTURE_WRAP_T,Z[x.wrapT]),(E===e.TEXTURE_3D||E===e.TEXTURE_2D_ARRAY)&&e.texParameteri(E,e.TEXTURE_WRAP_R,Z[x.wrapR]),e.texParameteri(E,e.TEXTURE_MAG_FILTER,wt[x.magFilter]),e.texParameteri(E,e.TEXTURE_MIN_FILTER,wt[x.minFilter]),x.compareFunction&&(e.texParameteri(E,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(E,e.TEXTURE_COMPARE_FUNC,mt[x.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(x.magFilter===is||x.minFilter!==Ff&&x.minFilter!==uo||x.type===Ta&&t.has("OES_texture_float_linear")===!1)return;if(x.anisotropy>1||i.get(x).__currentAnisotropy){let P=t.get("EXT_texture_filter_anisotropic");e.texParameterf(E,P.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(x.anisotropy,s.getMaxAnisotropy())),i.get(x).__currentAnisotropy=x.anisotropy}}}function Ht(E,x){let P=!1;E.__webglInit===void 0&&(E.__webglInit=!0,x.addEventListener("dispose",D));let Q=x.source,tt=h.get(Q);tt===void 0&&(tt={},h.set(Q,tt));let J=q(x);if(J!==E.__cacheKey){tt[J]===void 0&&(tt[J]={texture:e.createTexture(),usedTimes:0},r.memory.textures++,P=!0),tt[J].usedTimes++;let Ot=tt[E.__cacheKey];Ot!==void 0&&(tt[E.__cacheKey].usedTimes--,Ot.usedTimes===0&&N(x)),E.__cacheKey=J,E.__webglTexture=tt[J].texture}return P}function ie(E,x,P){let Q=e.TEXTURE_2D;(x.isDataArrayTexture||x.isCompressedArrayTexture)&&(Q=e.TEXTURE_2D_ARRAY),x.isData3DTexture&&(Q=e.TEXTURE_3D);let tt=Ht(E,x),J=x.source;n.bindTexture(Q,E.__webglTexture,e.TEXTURE0+P);let Ot=i.get(J);if(J.version!==Ot.__version||tt===!0){n.activeTexture(e.TEXTURE0+P);let Mt=ze.getPrimaries(ze.workingColorSpace),Et=x.colorSpace===Sr?null:ze.getPrimaries(x.colorSpace),_e=x.colorSpace===Sr||Mt===Et?e.NONE:e.BROWSER_DEFAULT_WEBGL;e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,x.flipY),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),e.pixelStorei(e.UNPACK_ALIGNMENT,x.unpackAlignment),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,_e);let vt=S(x.image,!1,s.maxTextureSize);vt=ut(x,vt);let Bt=a.convert(x.format,x.colorSpace),bt=a.convert(x.type),$t=y(x.internalFormat,Bt,bt,x.colorSpace,x.isVideoTexture);ft(Q,x);let zt,de=x.mipmaps,O=x.isVideoTexture!==!0,k=Ot.__version===void 0||tt===!0,w=J.dataReady,V=b(x,vt);if(x.isDepthTexture)$t=_(x.format===ec,x.type),k&&(O?n.texStorage2D(e.TEXTURE_2D,1,$t,vt.width,vt.height):n.texImage2D(e.TEXTURE_2D,0,$t,vt.width,vt.height,0,Bt,bt,null));else if(x.isDataTexture)if(de.length>0){O&&k&&n.texStorage2D(e.TEXTURE_2D,V,$t,de[0].width,de[0].height);for(let L=0,G=de.length;L<G;L++)zt=de[L],O?w&&n.texSubImage2D(e.TEXTURE_2D,L,0,0,zt.width,zt.height,Bt,bt,zt.data):n.texImage2D(e.TEXTURE_2D,L,$t,zt.width,zt.height,0,Bt,bt,zt.data);x.generateMipmaps=!1}else O?(k&&n.texStorage2D(e.TEXTURE_2D,V,$t,vt.width,vt.height),w&&n.texSubImage2D(e.TEXTURE_2D,0,0,0,vt.width,vt.height,Bt,bt,vt.data)):n.texImage2D(e.TEXTURE_2D,0,$t,vt.width,vt.height,0,Bt,bt,vt.data);else if(x.isCompressedTexture)if(x.isCompressedArrayTexture){O&&k&&n.texStorage3D(e.TEXTURE_2D_ARRAY,V,$t,de[0].width,de[0].height,vt.depth);for(let L=0,G=de.length;L<G;L++)if(zt=de[L],x.format!==xs)if(Bt!==null)if(O){if(w)if(x.layerUpdates.size>0){let it=HE(zt.width,zt.height,x.format,x.type);for(let lt of x.layerUpdates){let Tt=zt.data.subarray(lt*it/zt.data.BYTES_PER_ELEMENT,(lt+1)*it/zt.data.BYTES_PER_ELEMENT);n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,L,0,0,lt,zt.width,zt.height,1,Bt,Tt,0,0)}x.clearLayerUpdates()}else n.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,L,0,0,0,zt.width,zt.height,vt.depth,Bt,zt.data,0,0)}else n.compressedTexImage3D(e.TEXTURE_2D_ARRAY,L,$t,zt.width,zt.height,vt.depth,0,zt.data,0,0);else console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else O?w&&n.texSubImage3D(e.TEXTURE_2D_ARRAY,L,0,0,0,zt.width,zt.height,vt.depth,Bt,bt,zt.data):n.texImage3D(e.TEXTURE_2D_ARRAY,L,$t,zt.width,zt.height,vt.depth,0,Bt,bt,zt.data)}else{O&&k&&n.texStorage2D(e.TEXTURE_2D,V,$t,de[0].width,de[0].height);for(let L=0,G=de.length;L<G;L++)zt=de[L],x.format!==xs?Bt!==null?O?w&&n.compressedTexSubImage2D(e.TEXTURE_2D,L,0,0,zt.width,zt.height,Bt,zt.data):n.compressedTexImage2D(e.TEXTURE_2D,L,$t,zt.width,zt.height,0,zt.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):O?w&&n.texSubImage2D(e.TEXTURE_2D,L,0,0,zt.width,zt.height,Bt,bt,zt.data):n.texImage2D(e.TEXTURE_2D,L,$t,zt.width,zt.height,0,Bt,bt,zt.data)}else if(x.isDataArrayTexture)if(O){if(k&&n.texStorage3D(e.TEXTURE_2D_ARRAY,V,$t,vt.width,vt.height,vt.depth),w)if(x.layerUpdates.size>0){let L=HE(vt.width,vt.height,x.format,x.type);for(let G of x.layerUpdates){let it=vt.data.subarray(G*L/vt.data.BYTES_PER_ELEMENT,(G+1)*L/vt.data.BYTES_PER_ELEMENT);n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,G,vt.width,vt.height,1,Bt,bt,it)}x.clearLayerUpdates()}else n.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,0,vt.width,vt.height,vt.depth,Bt,bt,vt.data)}else n.texImage3D(e.TEXTURE_2D_ARRAY,0,$t,vt.width,vt.height,vt.depth,0,Bt,bt,vt.data);else if(x.isData3DTexture)O?(k&&n.texStorage3D(e.TEXTURE_3D,V,$t,vt.width,vt.height,vt.depth),w&&n.texSubImage3D(e.TEXTURE_3D,0,0,0,0,vt.width,vt.height,vt.depth,Bt,bt,vt.data)):n.texImage3D(e.TEXTURE_3D,0,$t,vt.width,vt.height,vt.depth,0,Bt,bt,vt.data);else if(x.isFramebufferTexture){if(k)if(O)n.texStorage2D(e.TEXTURE_2D,V,$t,vt.width,vt.height);else{let L=vt.width,G=vt.height;for(let it=0;it<V;it++)n.texImage2D(e.TEXTURE_2D,it,$t,L,G,0,Bt,bt,null),L>>=1,G>>=1}}else if(de.length>0){if(O&&k){let L=ot(de[0]);n.texStorage2D(e.TEXTURE_2D,V,$t,L.width,L.height)}for(let L=0,G=de.length;L<G;L++)zt=de[L],O?w&&n.texSubImage2D(e.TEXTURE_2D,L,0,0,Bt,bt,zt):n.texImage2D(e.TEXTURE_2D,L,$t,Bt,bt,zt);x.generateMipmaps=!1}else if(O){if(k){let L=ot(vt);n.texStorage2D(e.TEXTURE_2D,V,$t,L.width,L.height)}w&&n.texSubImage2D(e.TEXTURE_2D,0,0,0,Bt,bt,vt)}else n.texImage2D(e.TEXTURE_2D,0,$t,Bt,bt,vt);m(x)&&f(Q),Ot.__version=J.version,x.onUpdate&&x.onUpdate(x)}E.__version=x.version}function nt(E,x,P){if(x.image.length!==6)return;let Q=Ht(E,x),tt=x.source;n.bindTexture(e.TEXTURE_CUBE_MAP,E.__webglTexture,e.TEXTURE0+P);let J=i.get(tt);if(tt.version!==J.__version||Q===!0){n.activeTexture(e.TEXTURE0+P);let Ot=ze.getPrimaries(ze.workingColorSpace),Mt=x.colorSpace===Sr?null:ze.getPrimaries(x.colorSpace),Et=x.colorSpace===Sr||Ot===Mt?e.NONE:e.BROWSER_DEFAULT_WEBGL;e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,x.flipY),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),e.pixelStorei(e.UNPACK_ALIGNMENT,x.unpackAlignment),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,Et);let _e=x.isCompressedTexture||x.image[0].isCompressedTexture,vt=x.image[0]&&x.image[0].isDataTexture,Bt=[];for(let G=0;G<6;G++)!_e&&!vt?Bt[G]=S(x.image[G],!0,s.maxCubemapSize):Bt[G]=vt?x.image[G].image:x.image[G],Bt[G]=ut(x,Bt[G]);let bt=Bt[0],$t=a.convert(x.format,x.colorSpace),zt=a.convert(x.type),de=y(x.internalFormat,$t,zt,x.colorSpace),O=x.isVideoTexture!==!0,k=J.__version===void 0||Q===!0,w=tt.dataReady,V=b(x,bt);ft(e.TEXTURE_CUBE_MAP,x);let L;if(_e){O&&k&&n.texStorage2D(e.TEXTURE_CUBE_MAP,V,de,bt.width,bt.height);for(let G=0;G<6;G++){L=Bt[G].mipmaps;for(let it=0;it<L.length;it++){let lt=L[it];x.format!==xs?$t!==null?O?w&&n.compressedTexSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,it,0,0,lt.width,lt.height,$t,lt.data):n.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,it,de,lt.width,lt.height,0,lt.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):O?w&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,it,0,0,lt.width,lt.height,$t,zt,lt.data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,it,de,lt.width,lt.height,0,$t,zt,lt.data)}}}else{if(L=x.mipmaps,O&&k){L.length>0&&V++;let G=ot(Bt[0]);n.texStorage2D(e.TEXTURE_CUBE_MAP,V,de,G.width,G.height)}for(let G=0;G<6;G++)if(vt){O?w&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,0,0,0,Bt[G].width,Bt[G].height,$t,zt,Bt[G].data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,0,de,Bt[G].width,Bt[G].height,0,$t,zt,Bt[G].data);for(let it=0;it<L.length;it++){let Tt=L[it].image[G].image;O?w&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,it+1,0,0,Tt.width,Tt.height,$t,zt,Tt.data):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,it+1,de,Tt.width,Tt.height,0,$t,zt,Tt.data)}}else{O?w&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,0,0,0,$t,zt,Bt[G]):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,0,de,$t,zt,Bt[G]);for(let it=0;it<L.length;it++){let lt=L[it];O?w&&n.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,it+1,0,0,$t,zt,lt.image[G]):n.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,it+1,de,$t,zt,lt.image[G])}}}m(x)&&f(e.TEXTURE_CUBE_MAP),J.__version=tt.version,x.onUpdate&&x.onUpdate(x)}E.__version=x.version}function rt(E,x,P,Q,tt,J){let Ot=a.convert(P.format,P.colorSpace),Mt=a.convert(P.type),Et=y(P.internalFormat,Ot,Mt,P.colorSpace);if(!i.get(x).__hasExternalTextures){let vt=Math.max(1,x.width>>J),Bt=Math.max(1,x.height>>J);tt===e.TEXTURE_3D||tt===e.TEXTURE_2D_ARRAY?n.texImage3D(tt,J,Et,vt,Bt,x.depth,0,Ot,Mt,null):n.texImage2D(tt,J,Et,vt,Bt,0,Ot,Mt,null)}n.bindFramebuffer(e.FRAMEBUFFER,E),ce(x)?o.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,Q,tt,i.get(P).__webglTexture,0,ee(x)):(tt===e.TEXTURE_2D||tt>=e.TEXTURE_CUBE_MAP_POSITIVE_X&&tt<=e.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&e.framebufferTexture2D(e.FRAMEBUFFER,Q,tt,i.get(P).__webglTexture,J),n.bindFramebuffer(e.FRAMEBUFFER,null)}function Rt(E,x,P){if(e.bindRenderbuffer(e.RENDERBUFFER,E),x.depthBuffer){let Q=x.depthTexture,tt=Q&&Q.isDepthTexture?Q.type:null,J=_(x.stencilBuffer,tt),Ot=x.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,Mt=ee(x);ce(x)?o.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Mt,J,x.width,x.height):P?e.renderbufferStorageMultisample(e.RENDERBUFFER,Mt,J,x.width,x.height):e.renderbufferStorage(e.RENDERBUFFER,J,x.width,x.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,Ot,e.RENDERBUFFER,E)}else{let Q=x.textures;for(let tt=0;tt<Q.length;tt++){let J=Q[tt],Ot=a.convert(J.format,J.colorSpace),Mt=a.convert(J.type),Et=y(J.internalFormat,Ot,Mt,J.colorSpace),_e=ee(x);P&&ce(x)===!1?e.renderbufferStorageMultisample(e.RENDERBUFFER,_e,Et,x.width,x.height):ce(x)?o.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,_e,Et,x.width,x.height):e.renderbufferStorage(e.RENDERBUFFER,Et,x.width,x.height)}}e.bindRenderbuffer(e.RENDERBUFFER,null)}function St(E,x){if(x&&x.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(n.bindFramebuffer(e.FRAMEBUFFER,E),!(x.depthTexture&&x.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");(!i.get(x.depthTexture).__webglTexture||x.depthTexture.image.width!==x.width||x.depthTexture.image.height!==x.height)&&(x.depthTexture.image.width=x.width,x.depthTexture.image.height=x.height,x.depthTexture.needsUpdate=!0),K(x.depthTexture,0);let Q=i.get(x.depthTexture).__webglTexture,tt=ee(x);if(x.depthTexture.format===Kl)ce(x)?o.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,Q,0,tt):e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,Q,0);else if(x.depthTexture.format===ec)ce(x)?o.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.TEXTURE_2D,Q,0,tt):e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.TEXTURE_2D,Q,0);else throw new Error("Unknown depthTexture format")}function Kt(E){let x=i.get(E),P=E.isWebGLCubeRenderTarget===!0;if(x.__boundDepthTexture!==E.depthTexture){let Q=E.depthTexture;if(x.__depthDisposeCallback&&x.__depthDisposeCallback(),Q){let tt=()=>{delete x.__boundDepthTexture,delete x.__depthDisposeCallback,Q.removeEventListener("dispose",tt)};Q.addEventListener("dispose",tt),x.__depthDisposeCallback=tt}x.__boundDepthTexture=Q}if(E.depthTexture&&!x.__autoAllocateDepthBuffer){if(P)throw new Error("target.depthTexture not supported in Cube render targets");St(x.__webglFramebuffer,E)}else if(P){x.__webglDepthbuffer=[];for(let Q=0;Q<6;Q++)if(n.bindFramebuffer(e.FRAMEBUFFER,x.__webglFramebuffer[Q]),x.__webglDepthbuffer[Q]===void 0)x.__webglDepthbuffer[Q]=e.createRenderbuffer(),Rt(x.__webglDepthbuffer[Q],E,!1);else{let tt=E.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,J=x.__webglDepthbuffer[Q];e.bindRenderbuffer(e.RENDERBUFFER,J),e.framebufferRenderbuffer(e.FRAMEBUFFER,tt,e.RENDERBUFFER,J)}}else if(n.bindFramebuffer(e.FRAMEBUFFER,x.__webglFramebuffer),x.__webglDepthbuffer===void 0)x.__webglDepthbuffer=e.createRenderbuffer(),Rt(x.__webglDepthbuffer,E,!1);else{let Q=E.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,tt=x.__webglDepthbuffer;e.bindRenderbuffer(e.RENDERBUFFER,tt),e.framebufferRenderbuffer(e.FRAMEBUFFER,Q,e.RENDERBUFFER,tt)}n.bindFramebuffer(e.FRAMEBUFFER,null)}function Nt(E,x,P){let Q=i.get(E);x!==void 0&&rt(Q.__webglFramebuffer,E,E.texture,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,0),P!==void 0&&Kt(E)}function Vt(E){let x=E.texture,P=i.get(E),Q=i.get(x);E.addEventListener("dispose",R);let tt=E.textures,J=E.isWebGLCubeRenderTarget===!0,Ot=tt.length>1;if(Ot||(Q.__webglTexture===void 0&&(Q.__webglTexture=e.createTexture()),Q.__version=x.version,r.memory.textures++),J){P.__webglFramebuffer=[];for(let Mt=0;Mt<6;Mt++)if(x.mipmaps&&x.mipmaps.length>0){P.__webglFramebuffer[Mt]=[];for(let Et=0;Et<x.mipmaps.length;Et++)P.__webglFramebuffer[Mt][Et]=e.createFramebuffer()}else P.__webglFramebuffer[Mt]=e.createFramebuffer()}else{if(x.mipmaps&&x.mipmaps.length>0){P.__webglFramebuffer=[];for(let Mt=0;Mt<x.mipmaps.length;Mt++)P.__webglFramebuffer[Mt]=e.createFramebuffer()}else P.__webglFramebuffer=e.createFramebuffer();if(Ot)for(let Mt=0,Et=tt.length;Mt<Et;Mt++){let _e=i.get(tt[Mt]);_e.__webglTexture===void 0&&(_e.__webglTexture=e.createTexture(),r.memory.textures++)}if(E.samples>0&&ce(E)===!1){P.__webglMultisampledFramebuffer=e.createFramebuffer(),P.__webglColorRenderbuffer=[],n.bindFramebuffer(e.FRAMEBUFFER,P.__webglMultisampledFramebuffer);for(let Mt=0;Mt<tt.length;Mt++){let Et=tt[Mt];P.__webglColorRenderbuffer[Mt]=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,P.__webglColorRenderbuffer[Mt]);let _e=a.convert(Et.format,Et.colorSpace),vt=a.convert(Et.type),Bt=y(Et.internalFormat,_e,vt,Et.colorSpace,E.isXRRenderTarget===!0),bt=ee(E);e.renderbufferStorageMultisample(e.RENDERBUFFER,bt,Bt,E.width,E.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+Mt,e.RENDERBUFFER,P.__webglColorRenderbuffer[Mt])}e.bindRenderbuffer(e.RENDERBUFFER,null),E.depthBuffer&&(P.__webglDepthRenderbuffer=e.createRenderbuffer(),Rt(P.__webglDepthRenderbuffer,E,!0)),n.bindFramebuffer(e.FRAMEBUFFER,null)}}if(J){n.bindTexture(e.TEXTURE_CUBE_MAP,Q.__webglTexture),ft(e.TEXTURE_CUBE_MAP,x);for(let Mt=0;Mt<6;Mt++)if(x.mipmaps&&x.mipmaps.length>0)for(let Et=0;Et<x.mipmaps.length;Et++)rt(P.__webglFramebuffer[Mt][Et],E,x,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+Mt,Et);else rt(P.__webglFramebuffer[Mt],E,x,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+Mt,0);m(x)&&f(e.TEXTURE_CUBE_MAP),n.unbindTexture()}else if(Ot){for(let Mt=0,Et=tt.length;Mt<Et;Mt++){let _e=tt[Mt],vt=i.get(_e);n.bindTexture(e.TEXTURE_2D,vt.__webglTexture),ft(e.TEXTURE_2D,_e),rt(P.__webglFramebuffer,E,_e,e.COLOR_ATTACHMENT0+Mt,e.TEXTURE_2D,0),m(_e)&&f(e.TEXTURE_2D)}n.unbindTexture()}else{let Mt=e.TEXTURE_2D;if((E.isWebGL3DRenderTarget||E.isWebGLArrayRenderTarget)&&(Mt=E.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),n.bindTexture(Mt,Q.__webglTexture),ft(Mt,x),x.mipmaps&&x.mipmaps.length>0)for(let Et=0;Et<x.mipmaps.length;Et++)rt(P.__webglFramebuffer[Et],E,x,e.COLOR_ATTACHMENT0,Mt,Et);else rt(P.__webglFramebuffer,E,x,e.COLOR_ATTACHMENT0,Mt,0);m(x)&&f(Mt),n.unbindTexture()}E.depthBuffer&&Kt(E)}function me(E){let x=E.textures;for(let P=0,Q=x.length;P<Q;P++){let tt=x[P];if(m(tt)){let J=E.isWebGLCubeRenderTarget?e.TEXTURE_CUBE_MAP:e.TEXTURE_2D,Ot=i.get(tt).__webglTexture;n.bindTexture(J,Ot),f(J),n.unbindTexture()}}}let te=[],C=[];function sn(E){if(E.samples>0){if(ce(E)===!1){let x=E.textures,P=E.width,Q=E.height,tt=e.COLOR_BUFFER_BIT,J=E.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,Ot=i.get(E),Mt=x.length>1;if(Mt)for(let Et=0;Et<x.length;Et++)n.bindFramebuffer(e.FRAMEBUFFER,Ot.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+Et,e.RENDERBUFFER,null),n.bindFramebuffer(e.FRAMEBUFFER,Ot.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+Et,e.TEXTURE_2D,null,0);n.bindFramebuffer(e.READ_FRAMEBUFFER,Ot.__webglMultisampledFramebuffer),n.bindFramebuffer(e.DRAW_FRAMEBUFFER,Ot.__webglFramebuffer);for(let Et=0;Et<x.length;Et++){if(E.resolveDepthBuffer&&(E.depthBuffer&&(tt|=e.DEPTH_BUFFER_BIT),E.stencilBuffer&&E.resolveStencilBuffer&&(tt|=e.STENCIL_BUFFER_BIT)),Mt){e.framebufferRenderbuffer(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,Ot.__webglColorRenderbuffer[Et]);let _e=i.get(x[Et]).__webglTexture;e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,_e,0)}e.blitFramebuffer(0,0,P,Q,0,0,P,Q,tt,e.NEAREST),l===!0&&(te.length=0,C.length=0,te.push(e.COLOR_ATTACHMENT0+Et),E.depthBuffer&&E.resolveDepthBuffer===!1&&(te.push(J),C.push(J),e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,C)),e.invalidateFramebuffer(e.READ_FRAMEBUFFER,te))}if(n.bindFramebuffer(e.READ_FRAMEBUFFER,null),n.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),Mt)for(let Et=0;Et<x.length;Et++){n.bindFramebuffer(e.FRAMEBUFFER,Ot.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+Et,e.RENDERBUFFER,Ot.__webglColorRenderbuffer[Et]);let _e=i.get(x[Et]).__webglTexture;n.bindFramebuffer(e.FRAMEBUFFER,Ot.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+Et,e.TEXTURE_2D,_e,0)}n.bindFramebuffer(e.DRAW_FRAMEBUFFER,Ot.__webglMultisampledFramebuffer)}else if(E.depthBuffer&&E.resolveDepthBuffer===!1&&l){let x=E.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,[x])}}}function ee(E){return Math.min(s.maxSamples,E.samples)}function ce(E){let x=i.get(E);return E.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&x.__useRenderToTexture!==!1}function j(E){let x=r.render.frame;u.get(E)!==x&&(u.set(E,x),E.update())}function ut(E,x){let P=E.colorSpace,Q=E.format,tt=E.type;return E.isCompressedTexture===!0||E.isVideoTexture===!0||P!==js&&P!==Sr&&(ze.getTransfer(P)===nn?(Q!==xs||tt!==bs)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",P)),x}function ot(E){return typeof HTMLImageElement<"u"&&E instanceof HTMLImageElement?(c.width=E.naturalWidth||E.width,c.height=E.naturalHeight||E.height):typeof VideoFrame<"u"&&E instanceof VideoFrame?(c.width=E.displayWidth,c.height=E.displayHeight):(c.width=E.width,c.height=E.height),c}this.allocateTextureUnit=F,this.resetTextureUnits=M,this.setTexture2D=K,this.setTexture2DArray=$,this.setTexture3D=B,this.setTextureCube=ct,this.rebindTextures=Nt,this.setupRenderTarget=Vt,this.updateRenderTargetMipmap=me,this.updateMultisampleRenderTarget=sn,this.setupDepthRenderbuffer=Kt,this.setupFrameBufferTexture=rt,this.useMultisampledRTT=ce}function sO(e,t){function n(i,s=Sr){let a,r=ze.getTransfer(s);if(i===bs)return e.UNSIGNED_BYTE;if(i===uy)return e.UNSIGNED_SHORT_4_4_4_4;if(i===hy)return e.UNSIGNED_SHORT_5_5_5_1;if(i===KE)return e.UNSIGNED_INT_5_9_9_9_REV;if(i===YE)return e.BYTE;if(i===ZE)return e.SHORT;if(i===Lu)return e.UNSIGNED_SHORT;if(i===cy)return e.INT;if(i===ho)return e.UNSIGNED_INT;if(i===Ta)return e.FLOAT;if(i===Es)return e.HALF_FLOAT;if(i===jE)return e.ALPHA;if(i===QE)return e.RGB;if(i===xs)return e.RGBA;if(i===JE)return e.LUMINANCE;if(i===$E)return e.LUMINANCE_ALPHA;if(i===Kl)return e.DEPTH_COMPONENT;if(i===ec)return e.DEPTH_STENCIL;if(i===tT)return e.RED;if(i===fy)return e.RED_INTEGER;if(i===eT)return e.RG;if(i===dy)return e.RG_INTEGER;if(i===py)return e.RGBA_INTEGER;if(i===cd||i===ud||i===hd||i===fd)if(r===nn)if(a=t.get("WEBGL_compressed_texture_s3tc_srgb"),a!==null){if(i===cd)return a.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(i===ud)return a.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(i===hd)return a.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(i===fd)return a.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(a=t.get("WEBGL_compressed_texture_s3tc"),a!==null){if(i===cd)return a.COMPRESSED_RGB_S3TC_DXT1_EXT;if(i===ud)return a.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(i===hd)return a.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(i===fd)return a.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(i===cv||i===uv||i===hv||i===fv)if(a=t.get("WEBGL_compressed_texture_pvrtc"),a!==null){if(i===cv)return a.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(i===uv)return a.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(i===hv)return a.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(i===fv)return a.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(i===dv||i===pv||i===mv)if(a=t.get("WEBGL_compressed_texture_etc"),a!==null){if(i===dv||i===pv)return r===nn?a.COMPRESSED_SRGB8_ETC2:a.COMPRESSED_RGB8_ETC2;if(i===mv)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:a.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(i===gv||i===vv||i===yv||i===_v||i===xv||i===bv||i===Sv||i===Mv||i===Ev||i===Tv||i===Av||i===wv||i===Rv||i===Cv)if(a=t.get("WEBGL_compressed_texture_astc"),a!==null){if(i===gv)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:a.COMPRESSED_RGBA_ASTC_4x4_KHR;if(i===vv)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:a.COMPRESSED_RGBA_ASTC_5x4_KHR;if(i===yv)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:a.COMPRESSED_RGBA_ASTC_5x5_KHR;if(i===_v)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:a.COMPRESSED_RGBA_ASTC_6x5_KHR;if(i===xv)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:a.COMPRESSED_RGBA_ASTC_6x6_KHR;if(i===bv)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:a.COMPRESSED_RGBA_ASTC_8x5_KHR;if(i===Sv)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:a.COMPRESSED_RGBA_ASTC_8x6_KHR;if(i===Mv)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:a.COMPRESSED_RGBA_ASTC_8x8_KHR;if(i===Ev)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:a.COMPRESSED_RGBA_ASTC_10x5_KHR;if(i===Tv)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:a.COMPRESSED_RGBA_ASTC_10x6_KHR;if(i===Av)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:a.COMPRESSED_RGBA_ASTC_10x8_KHR;if(i===wv)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:a.COMPRESSED_RGBA_ASTC_10x10_KHR;if(i===Rv)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:a.COMPRESSED_RGBA_ASTC_12x10_KHR;if(i===Cv)return r===nn?a.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:a.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(i===dd||i===Dv||i===Nv)if(a=t.get("EXT_texture_compression_bptc"),a!==null){if(i===dd)return r===nn?a.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:a.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(i===Dv)return a.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(i===Nv)return a.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(i===nT||i===Uv||i===Lv||i===Ov)if(a=t.get("EXT_texture_compression_rgtc"),a!==null){if(i===dd)return a.COMPRESSED_RED_RGTC1_EXT;if(i===Uv)return a.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(i===Lv)return a.COMPRESSED_RED_GREEN_RGTC2_EXT;if(i===Ov)return a.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return i===tc?e.UNSIGNED_INT_24_8:e[i]!==void 0?e[i]:null}return{convert:n}}function cO(e,t){function n(m,f){m.matrixAutoUpdate===!0&&m.updateMatrix(),f.value.copy(m.matrix)}function i(m,f){f.color.getRGB(m.fogColor.value,oT(e)),f.isFog?(m.fogNear.value=f.near,m.fogFar.value=f.far):f.isFogExp2&&(m.fogDensity.value=f.density)}function s(m,f,y,_,b){f.isMeshBasicMaterial||f.isMeshLambertMaterial?a(m,f):f.isMeshToonMaterial?(a(m,f),d(m,f)):f.isMeshPhongMaterial?(a(m,f),u(m,f)):f.isMeshStandardMaterial?(a(m,f),h(m,f),f.isMeshPhysicalMaterial&&p(m,f,b)):f.isMeshMatcapMaterial?(a(m,f),g(m,f)):f.isMeshDepthMaterial?a(m,f):f.isMeshDistanceMaterial?(a(m,f),S(m,f)):f.isMeshNormalMaterial?a(m,f):f.isLineBasicMaterial?(r(m,f),f.isLineDashedMaterial&&o(m,f)):f.isPointsMaterial?l(m,f,y,_):f.isSpriteMaterial?c(m,f):f.isShadowMaterial?(m.color.value.copy(f.color),m.opacity.value=f.opacity):f.isShaderMaterial&&(f.uniformsNeedUpdate=!1)}function a(m,f){m.opacity.value=f.opacity,f.color&&m.diffuse.value.copy(f.color),f.emissive&&m.emissive.value.copy(f.emissive).multiplyScalar(f.emissiveIntensity),f.map&&(m.map.value=f.map,n(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,n(f.alphaMap,m.alphaMapTransform)),f.bumpMap&&(m.bumpMap.value=f.bumpMap,n(f.bumpMap,m.bumpMapTransform),m.bumpScale.value=f.bumpScale,f.side===Ti&&(m.bumpScale.value*=-1)),f.normalMap&&(m.normalMap.value=f.normalMap,n(f.normalMap,m.normalMapTransform),m.normalScale.value.copy(f.normalScale),f.side===Ti&&m.normalScale.value.negate()),f.displacementMap&&(m.displacementMap.value=f.displacementMap,n(f.displacementMap,m.displacementMapTransform),m.displacementScale.value=f.displacementScale,m.displacementBias.value=f.displacementBias),f.emissiveMap&&(m.emissiveMap.value=f.emissiveMap,n(f.emissiveMap,m.emissiveMapTransform)),f.specularMap&&(m.specularMap.value=f.specularMap,n(f.specularMap,m.specularMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest);let y=t.get(f),_=y.envMap,b=y.envMapRotation;_&&(m.envMap.value=_,so.copy(b),so.x*=-1,so.y*=-1,so.z*=-1,_.isCubeTexture&&_.isRenderTargetTexture===!1&&(so.y*=-1,so.z*=-1),m.envMapRotation.value.setFromMatrix4(lO.makeRotationFromEuler(so)),m.flipEnvMap.value=_.isCubeTexture&&_.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=f.reflectivity,m.ior.value=f.ior,m.refractionRatio.value=f.refractionRatio),f.lightMap&&(m.lightMap.value=f.lightMap,m.lightMapIntensity.value=f.lightMapIntensity,n(f.lightMap,m.lightMapTransform)),f.aoMap&&(m.aoMap.value=f.aoMap,m.aoMapIntensity.value=f.aoMapIntensity,n(f.aoMap,m.aoMapTransform))}function r(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,f.map&&(m.map.value=f.map,n(f.map,m.mapTransform))}function o(m,f){m.dashSize.value=f.dashSize,m.totalSize.value=f.dashSize+f.gapSize,m.scale.value=f.scale}function l(m,f,y,_){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.size.value=f.size*y,m.scale.value=_*.5,f.map&&(m.map.value=f.map,n(f.map,m.uvTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,n(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function c(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.rotation.value=f.rotation,f.map&&(m.map.value=f.map,n(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,n(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function u(m,f){m.specular.value.copy(f.specular),m.shininess.value=Math.max(f.shininess,1e-4)}function d(m,f){f.gradientMap&&(m.gradientMap.value=f.gradientMap)}function h(m,f){m.metalness.value=f.metalness,f.metalnessMap&&(m.metalnessMap.value=f.metalnessMap,n(f.metalnessMap,m.metalnessMapTransform)),m.roughness.value=f.roughness,f.roughnessMap&&(m.roughnessMap.value=f.roughnessMap,n(f.roughnessMap,m.roughnessMapTransform)),f.envMap&&(m.envMapIntensity.value=f.envMapIntensity)}function p(m,f,y){m.ior.value=f.ior,f.sheen>0&&(m.sheenColor.value.copy(f.sheenColor).multiplyScalar(f.sheen),m.sheenRoughness.value=f.sheenRoughness,f.sheenColorMap&&(m.sheenColorMap.value=f.sheenColorMap,n(f.sheenColorMap,m.sheenColorMapTransform)),f.sheenRoughnessMap&&(m.sheenRoughnessMap.value=f.sheenRoughnessMap,n(f.sheenRoughnessMap,m.sheenRoughnessMapTransform))),f.clearcoat>0&&(m.clearcoat.value=f.clearcoat,m.clearcoatRoughness.value=f.clearcoatRoughness,f.clearcoatMap&&(m.clearcoatMap.value=f.clearcoatMap,n(f.clearcoatMap,m.clearcoatMapTransform)),f.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=f.clearcoatRoughnessMap,n(f.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),f.clearcoatNormalMap&&(m.clearcoatNormalMap.value=f.clearcoatNormalMap,n(f.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(f.clearcoatNormalScale),f.side===Ti&&m.clearcoatNormalScale.value.negate())),f.dispersion>0&&(m.dispersion.value=f.dispersion),f.iridescence>0&&(m.iridescence.value=f.iridescence,m.iridescenceIOR.value=f.iridescenceIOR,m.iridescenceThicknessMinimum.value=f.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=f.iridescenceThicknessRange[1],f.iridescenceMap&&(m.iridescenceMap.value=f.iridescenceMap,n(f.iridescenceMap,m.iridescenceMapTransform)),f.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=f.iridescenceThicknessMap,n(f.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),f.transmission>0&&(m.transmission.value=f.transmission,m.transmissionSamplerMap.value=y.texture,m.transmissionSamplerSize.value.set(y.width,y.height),f.transmissionMap&&(m.transmissionMap.value=f.transmissionMap,n(f.transmissionMap,m.transmissionMapTransform)),m.thickness.value=f.thickness,f.thicknessMap&&(m.thicknessMap.value=f.thicknessMap,n(f.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=f.attenuationDistance,m.attenuationColor.value.copy(f.attenuationColor)),f.anisotropy>0&&(m.anisotropyVector.value.set(f.anisotropy*Math.cos(f.anisotropyRotation),f.anisotropy*Math.sin(f.anisotropyRotation)),f.anisotropyMap&&(m.anisotropyMap.value=f.anisotropyMap,n(f.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=f.specularIntensity,m.specularColor.value.copy(f.specularColor),f.specularColorMap&&(m.specularColorMap.value=f.specularColorMap,n(f.specularColorMap,m.specularColorMapTransform)),f.specularIntensityMap&&(m.specularIntensityMap.value=f.specularIntensityMap,n(f.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,f){f.matcap&&(m.matcap.value=f.matcap)}function S(m,f){let y=t.get(f).light;m.referencePosition.value.setFromMatrixPosition(y.matrixWorld),m.nearDistance.value=y.shadow.camera.near,m.farDistance.value=y.shadow.camera.far}return{refreshFogUniforms:i,refreshMaterialUniforms:s}}function uO(e,t,n,i){let s={},a={},r=[],o=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function l(y,_){let b=_.program;i.uniformBlockBinding(y,b)}function c(y,_){let b=s[y.id];b===void 0&&(g(y),b=u(y),s[y.id]=b,y.addEventListener("dispose",m));let D=_.program;i.updateUBOMapping(y,D);let R=t.render.frame;a[y.id]!==R&&(h(y),a[y.id]=R)}function u(y){let _=d();y.__bindingPointIndex=_;let b=e.createBuffer(),D=y.__size,R=y.usage;return e.bindBuffer(e.UNIFORM_BUFFER,b),e.bufferData(e.UNIFORM_BUFFER,D,R),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,_,b),b}function d(){for(let y=0;y<o;y++)if(r.indexOf(y)===-1)return r.push(y),y;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function h(y){let _=s[y.id],b=y.uniforms,D=y.__cache;e.bindBuffer(e.UNIFORM_BUFFER,_);for(let R=0,A=b.length;R<A;R++){let N=Array.isArray(b[R])?b[R]:[b[R]];for(let et=0,v=N.length;et<v;et++){let M=N[et];if(p(M,R,et,D)===!0){let F=M.__offset,q=Array.isArray(M.value)?M.value:[M.value],K=0;for(let $=0;$<q.length;$++){let B=q[$],ct=S(B);typeof B=="number"||typeof B=="boolean"?(M.__data[0]=B,e.bufferSubData(e.UNIFORM_BUFFER,F+K,M.__data)):B.isMatrix3?(M.__data[0]=B.elements[0],M.__data[1]=B.elements[1],M.__data[2]=B.elements[2],M.__data[3]=0,M.__data[4]=B.elements[3],M.__data[5]=B.elements[4],M.__data[6]=B.elements[5],M.__data[7]=0,M.__data[8]=B.elements[6],M.__data[9]=B.elements[7],M.__data[10]=B.elements[8],M.__data[11]=0):(B.toArray(M.__data,K),K+=ct.storage/Float32Array.BYTES_PER_ELEMENT)}e.bufferSubData(e.UNIFORM_BUFFER,F,M.__data)}}}e.bindBuffer(e.UNIFORM_BUFFER,null)}function p(y,_,b,D){let R=y.value,A=_+"_"+b;if(D[A]===void 0)return typeof R=="number"||typeof R=="boolean"?D[A]=R:D[A]=R.clone(),!0;{let N=D[A];if(typeof R=="number"||typeof R=="boolean"){if(N!==R)return D[A]=R,!0}else if(N.equals(R)===!1)return N.copy(R),!0}return!1}function g(y){let _=y.uniforms,b=0,D=16;for(let A=0,N=_.length;A<N;A++){let et=Array.isArray(_[A])?_[A]:[_[A]];for(let v=0,M=et.length;v<M;v++){let F=et[v],q=Array.isArray(F.value)?F.value:[F.value];for(let K=0,$=q.length;K<$;K++){let B=q[K],ct=S(B),Z=b%D,wt=Z%ct.boundary,mt=Z+wt;b+=wt,mt!==0&&D-mt<ct.storage&&(b+=D-mt),F.__data=new Float32Array(ct.storage/Float32Array.BYTES_PER_ELEMENT),F.__offset=b,b+=ct.storage}}}let R=b%D;return R>0&&(b+=D-R),y.__size=b,y.__cache={},this}function S(y){let _={boundary:0,storage:0};return typeof y=="number"||typeof y=="boolean"?(_.boundary=4,_.storage=4):y.isVector2?(_.boundary=8,_.storage=8):y.isVector3||y.isColor?(_.boundary=16,_.storage=12):y.isVector4?(_.boundary=16,_.storage=16):y.isMatrix3?(_.boundary=48,_.storage=48):y.isMatrix4?(_.boundary=64,_.storage=64):y.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",y),_}function m(y){let _=y.target;_.removeEventListener("dispose",m);let b=r.indexOf(_.__bindingPointIndex);r.splice(b,1),e.deleteBuffer(s[_.id]),delete s[_.id],delete a[_.id]}function f(){for(let y in s)e.deleteBuffer(s[y]);r=[],s={},a={}}return{bind:l,update:c,dispose:f}}function GE(e,t,n,i,s,a,r){let o=Jv.distanceSqToPoint(e);if(o<n){let l=new W;Jv.closestPointToPoint(e,l),l.applyMatrix4(i);let c=s.ray.origin.distanceTo(l);if(c<s.near||c>s.far)return;a.push({distance:c,distanceToRay:Math.sqrt(o),point:l,index:t,face:null,faceIndex:null,barycoord:null,object:r})}}function ld(e,t,n){return!e||!n&&e.constructor===t?e:typeof t.BYTES_PER_ELEMENT=="number"?new t(e):Array.prototype.slice.call(e)}function hO(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}function kE(){return performance.now()}var vo,yo,uC,WM,hC,XE,fC,Ea,Zs,Ti,ii,qs,Ys,wa,qM,YM,dC,ro,pC,mC,gC,vC,yC,_C,xC,bC,Qg,Jg,SC,MC,EC,TC,AC,wC,RC,CC,DC,$g,tv,ev,Ks,nv,iv,Er,sv,WE,NC,UC,Mr,LC,OC,IC,PC,zC,BC,FC,qE,Jl,$l,av,rv,Hd,ov,co,lv,is,HC,Ff,_s,Sg,uo,bs,YE,ZE,Lu,cy,ho,Ta,Es,uy,hy,tc,KE,jE,QE,xs,JE,$E,Kl,ec,tT,fy,eT,dy,py,cd,ud,hd,fd,cv,uv,hv,fv,dv,pv,mv,gv,vv,yv,_v,xv,bv,Sv,Mv,Ev,Tv,Av,wv,Rv,Cv,dd,Dv,Nv,nT,Uv,Lv,Ov,md,Iv,Mg,ZM,KM,jM,VC,GC,kC,XC,Sr,Xs,js,my,Vd,gd,nn,vd,yd,Ul,QM,WC,qC,YC,iT,ZC,KC,jC,QC,JM,Bu,$M,Aa,_d,Ra,ti,tE,Du,Ou,sT,Yt,ye,Eg,eE,nE,iE,Eu,y3,ze,Ll,Pv,_3,bd,x3,Gi,ke,zv,Zn,Sd,Bv,Ss,W,wg,sE,fo,_a,ms,Hf,Ol,Il,Pl,gr,vr,$r,Tu,Vf,Gf,to,b3,Au,Cg,nc,xa,Dg,kf,yr,Ng,Xf,Ug,ic,pn,zl,gs,S3,M3,_r,Wf,Hi,aE,rE,Ca,Md,E3,oE,Bl,ba,qf,wu,T3,A3,lE,cE,uE,hE,w3,Fl,Lg,ss,vs,Sa,Og,Ma,Hl,Vl,fE,Ig,Pg,zg,Bg,Fg,Hg,oo,rT,xr,Yf,fe,ei,R3,po,Da,Mn,Zf,qe,Ed,Td,ai,C3,ns,Gg,Gl,Vi,Ru,Fn,En,dE,eo,Kf,pE,jf,Qf,Jf,kg,$f,mE,td,si,Iu,lc,U3,L3,un,Ad,br,gE,vE,mi,kl,Xl,Fv,wd,Hv,Xg,O3,I3,ys,no,nd,Rd,Cd,z3,B3,F3,H3,V3,G3,k3,X3,W3,q3,Y3,Z3,K3,j3,Q3,J3,$3,tD,eD,nD,iD,sD,aD,rD,oD,lD,cD,uD,hD,fD,dD,pD,mD,gD,vD,yD,_D,xD,bD,SD,MD,ED,TD,AD,wD,RD,CD,DD,ND,UD,LD,OD,ID,PD,zD,BD,FD,HD,VD,GD,kD,XD,WD,qD,YD,ZD,KD,jD,QD,JD,$D,tN,eN,nN,iN,sN,aN,rN,oN,lN,cN,uN,hN,fN,dN,pN,mN,gN,vN,yN,_N,xN,bN,SN,MN,EN,TN,AN,wN,RN,CN,DN,NN,UN,LN,ON,IN,PN,zN,BN,FN,HN,VN,GN,kN,XN,WN,qN,YN,ZN,KN,jN,QN,JN,$N,tU,eU,nU,iU,sU,aU,rU,oU,lU,cU,uU,hU,fU,dU,pU,mU,ve,Lt,Ws,id,io,gU,Pu,Yl,yE,lo,Wg,_E,qg,Yg,Zg,Kg,ao,Wl,xE,Dd,Nd,cT,EE,uT,hT,fT,TE,AE,wE,RE,CE,Vv,Gv,kv,jg,Ql,_L,xL,ad,CL,DL,UL,HL,Wv,qv,YL,Yv,Zv,QL,JL,tO,Kv,Zl,aO,Uu,rO,oO,jv,Qv,so,lO,Ud,Ld,Na,ac,VE,Jv,rd,od,Od,Id,rc,$v,ty,ey,Ms,mo,ny,iy,sy,Pd,go,ay,ry,fO,oy,zd,Bd,yy,dO,_y,pO,mO,gO,vO,yO,_O,xO,ly,on,bI,zu,Fd,Qs=gn(()=>{vo={LEFT:0,MIDDLE:1,RIGHT:2,ROTATE:0,DOLLY:1,PAN:2},yo={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},uC=0,WM=1,hC=2,XE=1,fC=2,Ea=3,Zs=0,Ti=1,ii=2,qs=0,Ys=1,wa=2,qM=3,YM=4,dC=5,ro=100,pC=101,mC=102,gC=103,vC=104,yC=200,_C=201,xC=202,bC=203,Qg=204,Jg=205,SC=206,MC=207,EC=208,TC=209,AC=210,wC=211,RC=212,CC=213,DC=214,$g=0,tv=1,ev=2,Ks=3,nv=4,iv=5,Er=6,sv=7,WE=0,NC=1,UC=2,Mr=0,LC=1,OC=2,IC=3,PC=4,zC=5,BC=6,FC=7,qE=300,Jl=301,$l=302,av=303,rv=304,Hd=306,ov=1e3,co=1001,lv=1002,is=1003,HC=1004,Ff=1005,_s=1006,Sg=1007,uo=1008,bs=1009,YE=1010,ZE=1011,Lu=1012,cy=1013,ho=1014,Ta=1015,Es=1016,uy=1017,hy=1018,tc=1020,KE=35902,jE=1021,QE=1022,xs=1023,JE=1024,$E=1025,Kl=1026,ec=1027,tT=1028,fy=1029,eT=1030,dy=1031,py=1033,cd=33776,ud=33777,hd=33778,fd=33779,cv=35840,uv=35841,hv=35842,fv=35843,dv=36196,pv=37492,mv=37496,gv=37808,vv=37809,yv=37810,_v=37811,xv=37812,bv=37813,Sv=37814,Mv=37815,Ev=37816,Tv=37817,Av=37818,wv=37819,Rv=37820,Cv=37821,dd=36492,Dv=36494,Nv=36495,nT=36283,Uv=36284,Lv=36285,Ov=36286,md=2300,Iv=2301,Mg=2302,ZM=2400,KM=2401,jM=2402,VC=3200,GC=3201,kC=0,XC=1,Sr="",Xs="srgb",js="srgb-linear",my="display-p3",Vd="display-p3-linear",gd="linear",nn="srgb",vd="rec709",yd="p3",Ul=7680,QM=519,WC=512,qC=513,YC=514,iT=515,ZC=516,KC=517,jC=518,QC=519,JM=35044,Bu=35048,$M="300 es",Aa=2e3,_d=2001,Ra=class{addEventListener(t,n){this._listeners===void 0&&(this._listeners={});let i=this._listeners;i[t]===void 0&&(i[t]=[]),i[t].indexOf(n)===-1&&i[t].push(n)}hasEventListener(t,n){if(this._listeners===void 0)return!1;let i=this._listeners;return i[t]!==void 0&&i[t].indexOf(n)!==-1}removeEventListener(t,n){if(this._listeners===void 0)return;let s=this._listeners[t];if(s!==void 0){let a=s.indexOf(n);a!==-1&&s.splice(a,1)}}dispatchEvent(t){if(this._listeners===void 0)return;let i=this._listeners[t.type];if(i!==void 0){t.target=this;let s=i.slice(0);for(let a=0,r=s.length;a<r;a++)s[a].call(this,t);t.target=null}}},ti=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],tE=1234567,Du=Math.PI/180,Ou=180/Math.PI;sT={DEG2RAD:Du,RAD2DEG:Ou,generateUUID:oc,clamp:ni,euclideanModulo:gy,mapLinear:JC,inverseLerp:$C,lerp:Nu,damp:t3,pingpong:e3,smoothstep:n3,smootherstep:i3,randInt:s3,randFloat:a3,randFloatSpread:r3,seededRandom:o3,degToRad:l3,radToDeg:c3,isPowerOfTwo:u3,ceilPowerOfTwo:h3,floorPowerOfTwo:f3,setQuaternionFromProperEuler:d3,normalize:di,denormalize:ql},Yt=class e{constructor(t=0,n=0){e.prototype.isVector2=!0,this.x=t,this.y=n}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,n){return this.x=t,this.y=n,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,n){switch(t){case 0:this.x=n;break;case 1:this.y=n;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,n){return this.x=t.x+n.x,this.y=t.y+n.y,this}addScaledVector(t,n){return this.x+=t.x*n,this.y+=t.y*n,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,n){return this.x=t.x-n.x,this.y=t.y-n.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){let n=this.x,i=this.y,s=t.elements;return this.x=s[0]*n+s[3]*i+s[6],this.y=s[1]*n+s[4]*i+s[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,n){return this.x=Math.max(t.x,Math.min(n.x,this.x)),this.y=Math.max(t.y,Math.min(n.y,this.y)),this}clampScalar(t,n){return this.x=Math.max(t,Math.min(n,this.x)),this.y=Math.max(t,Math.min(n,this.y)),this}clampLength(t,n){let i=this.length();return this.divideScalar(i||1).multiplyScalar(Math.max(t,Math.min(n,i)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){let n=Math.sqrt(this.lengthSq()*t.lengthSq());if(n===0)return Math.PI/2;let i=this.dot(t)/n;return Math.acos(ni(i,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let n=this.x-t.x,i=this.y-t.y;return n*n+i*i}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,n){return this.x+=(t.x-this.x)*n,this.y+=(t.y-this.y)*n,this}lerpVectors(t,n,i){return this.x=t.x+(n.x-t.x)*i,this.y=t.y+(n.y-t.y)*i,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,n=0){return this.x=t[n],this.y=t[n+1],this}toArray(t=[],n=0){return t[n]=this.x,t[n+1]=this.y,t}fromBufferAttribute(t,n){return this.x=t.getX(n),this.y=t.getY(n),this}rotateAround(t,n){let i=Math.cos(n),s=Math.sin(n),a=this.x-t.x,r=this.y-t.y;return this.x=a*i-r*s+t.x,this.y=a*s+r*i+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},ye=class e{constructor(t,n,i,s,a,r,o,l,c){e.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,n,i,s,a,r,o,l,c)}set(t,n,i,s,a,r,o,l,c){let u=this.elements;return u[0]=t,u[1]=s,u[2]=o,u[3]=n,u[4]=a,u[5]=l,u[6]=i,u[7]=r,u[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){let n=this.elements,i=t.elements;return n[0]=i[0],n[1]=i[1],n[2]=i[2],n[3]=i[3],n[4]=i[4],n[5]=i[5],n[6]=i[6],n[7]=i[7],n[8]=i[8],this}extractBasis(t,n,i){return t.setFromMatrix3Column(this,0),n.setFromMatrix3Column(this,1),i.setFromMatrix3Column(this,2),this}setFromMatrix4(t){let n=t.elements;return this.set(n[0],n[4],n[8],n[1],n[5],n[9],n[2],n[6],n[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,n){let i=t.elements,s=n.elements,a=this.elements,r=i[0],o=i[3],l=i[6],c=i[1],u=i[4],d=i[7],h=i[2],p=i[5],g=i[8],S=s[0],m=s[3],f=s[6],y=s[1],_=s[4],b=s[7],D=s[2],R=s[5],A=s[8];return a[0]=r*S+o*y+l*D,a[3]=r*m+o*_+l*R,a[6]=r*f+o*b+l*A,a[1]=c*S+u*y+d*D,a[4]=c*m+u*_+d*R,a[7]=c*f+u*b+d*A,a[2]=h*S+p*y+g*D,a[5]=h*m+p*_+g*R,a[8]=h*f+p*b+g*A,this}multiplyScalar(t){let n=this.elements;return n[0]*=t,n[3]*=t,n[6]*=t,n[1]*=t,n[4]*=t,n[7]*=t,n[2]*=t,n[5]*=t,n[8]*=t,this}determinant(){let t=this.elements,n=t[0],i=t[1],s=t[2],a=t[3],r=t[4],o=t[5],l=t[6],c=t[7],u=t[8];return n*r*u-n*o*c-i*a*u+i*o*l+s*a*c-s*r*l}invert(){let t=this.elements,n=t[0],i=t[1],s=t[2],a=t[3],r=t[4],o=t[5],l=t[6],c=t[7],u=t[8],d=u*r-o*c,h=o*l-u*a,p=c*a-r*l,g=n*d+i*h+s*p;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);let S=1/g;return t[0]=d*S,t[1]=(s*c-u*i)*S,t[2]=(o*i-s*r)*S,t[3]=h*S,t[4]=(u*n-s*l)*S,t[5]=(s*a-o*n)*S,t[6]=p*S,t[7]=(i*l-c*n)*S,t[8]=(r*n-i*a)*S,this}transpose(){let t,n=this.elements;return t=n[1],n[1]=n[3],n[3]=t,t=n[2],n[2]=n[6],n[6]=t,t=n[5],n[5]=n[7],n[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){let n=this.elements;return t[0]=n[0],t[1]=n[3],t[2]=n[6],t[3]=n[1],t[4]=n[4],t[5]=n[7],t[6]=n[2],t[7]=n[5],t[8]=n[8],this}setUvTransform(t,n,i,s,a,r,o){let l=Math.cos(a),c=Math.sin(a);return this.set(i*l,i*c,-i*(l*r+c*o)+r+t,-s*c,s*l,-s*(-c*r+l*o)+o+n,0,0,1),this}scale(t,n){return this.premultiply(Eg.makeScale(t,n)),this}rotate(t){return this.premultiply(Eg.makeRotation(-t)),this}translate(t,n){return this.premultiply(Eg.makeTranslation(t,n)),this}makeTranslation(t,n){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,n,0,0,1),this}makeRotation(t){let n=Math.cos(t),i=Math.sin(t);return this.set(n,-i,0,i,n,0,0,0,1),this}makeScale(t,n){return this.set(t,0,0,0,n,0,0,0,1),this}equals(t){let n=this.elements,i=t.elements;for(let s=0;s<9;s++)if(n[s]!==i[s])return!1;return!0}fromArray(t,n=0){for(let i=0;i<9;i++)this.elements[i]=t[i+n];return this}toArray(t=[],n=0){let i=this.elements;return t[n]=i[0],t[n+1]=i[1],t[n+2]=i[2],t[n+3]=i[3],t[n+4]=i[4],t[n+5]=i[5],t[n+6]=i[6],t[n+7]=i[7],t[n+8]=i[8],t}clone(){return new this.constructor().fromArray(this.elements)}},Eg=new ye;eE={};nE=new ye().set(.8224621,.177538,0,.0331941,.9668058,0,.0170827,.0723974,.9105199),iE=new ye().set(1.2249401,-.2249404,0,-.0420569,1.0420571,0,-.0196376,-.0786361,1.0982735),Eu={[js]:{transfer:gd,primaries:vd,luminanceCoefficients:[.2126,.7152,.0722],toReference:e=>e,fromReference:e=>e},[Xs]:{transfer:nn,primaries:vd,luminanceCoefficients:[.2126,.7152,.0722],toReference:e=>e.convertSRGBToLinear(),fromReference:e=>e.convertLinearToSRGB()},[Vd]:{transfer:gd,primaries:yd,luminanceCoefficients:[.2289,.6917,.0793],toReference:e=>e.applyMatrix3(iE),fromReference:e=>e.applyMatrix3(nE)},[my]:{transfer:nn,primaries:yd,luminanceCoefficients:[.2289,.6917,.0793],toReference:e=>e.convertSRGBToLinear().applyMatrix3(iE),fromReference:e=>e.applyMatrix3(nE).convertLinearToSRGB()}},y3=new Set([js,Vd]),ze={enabled:!0,_workingColorSpace:js,get workingColorSpace(){return this._workingColorSpace},set workingColorSpace(e){if(!y3.has(e))throw new Error(`Unsupported working color space, "${e}".`);this._workingColorSpace=e},convert:function(e,t,n){if(this.enabled===!1||t===n||!t||!n)return e;let i=Eu[t].toReference,s=Eu[n].fromReference;return s(i(e))},fromWorkingColorSpace:function(e,t){return this.convert(e,this._workingColorSpace,t)},toWorkingColorSpace:function(e,t){return this.convert(e,t,this._workingColorSpace)},getPrimaries:function(e){return Eu[e].primaries},getTransfer:function(e){return e===Sr?gd:Eu[e].transfer},getLuminanceCoefficients:function(e,t=this._workingColorSpace){return e.fromArray(Eu[t].luminanceCoefficients)}};Pv=class{static getDataURL(t){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let n;if(t instanceof HTMLCanvasElement)n=t;else{Ll===void 0&&(Ll=xd("canvas")),Ll.width=t.width,Ll.height=t.height;let i=Ll.getContext("2d");t instanceof ImageData?i.putImageData(t,0,0):i.drawImage(t,0,0,t.width,t.height),n=Ll}return n.width>2048||n.height>2048?(console.warn("THREE.ImageUtils.getDataURL: Image converted to jpg for performance reasons",t),n.toDataURL("image/jpeg",.6)):n.toDataURL("image/png")}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){let n=xd("canvas");n.width=t.width,n.height=t.height;let i=n.getContext("2d");i.drawImage(t,0,0,t.width,t.height);let s=i.getImageData(0,0,t.width,t.height),a=s.data;for(let r=0;r<a.length;r++)a[r]=jl(a[r]/255)*255;return i.putImageData(s,0,0),n}else if(t.data){let n=t.data.slice(0);for(let i=0;i<n.length;i++)n instanceof Uint8Array||n instanceof Uint8ClampedArray?n[i]=Math.floor(jl(n[i]/255)*255):n[i]=jl(n[i]);return{data:n,width:t.width,height:t.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}},_3=0,bd=class{constructor(t=null){this.isSource=!0,Object.defineProperty(this,"id",{value:_3++}),this.uuid=oc(),this.data=t,this.dataReady=!0,this.version=0}set needsUpdate(t){t===!0&&this.version++}toJSON(t){let n=t===void 0||typeof t=="string";if(!n&&t.images[this.uuid]!==void 0)return t.images[this.uuid];let i={uuid:this.uuid,url:""},s=this.data;if(s!==null){let a;if(Array.isArray(s)){a=[];for(let r=0,o=s.length;r<o;r++)s[r].isDataTexture?a.push(Ag(s[r].image)):a.push(Ag(s[r]))}else a=Ag(s);i.url=a}return n||(t.images[this.uuid]=i),i}};x3=0,Gi=class e extends Ra{constructor(t=e.DEFAULT_IMAGE,n=e.DEFAULT_MAPPING,i=co,s=co,a=_s,r=uo,o=xs,l=bs,c=e.DEFAULT_ANISOTROPY,u=Sr){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:x3++}),this.uuid=oc(),this.name="",this.source=new bd(t),this.mipmaps=[],this.mapping=n,this.channel=0,this.wrapS=i,this.wrapT=s,this.magFilter=a,this.minFilter=r,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new Yt(0,0),this.repeat=new Yt(1,1),this.center=new Yt(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new ye,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.version=0,this.onUpdate=null,this.isRenderTargetTexture=!1,this.pmremVersion=0}get image(){return this.source.data}set image(t=null){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}toJSON(t){let n=t===void 0||typeof t=="string";if(!n&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];let i={metadata:{version:4.6,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(i.userData=this.userData),n||(t.textures[this.uuid]=i),i}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==qE)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case ov:t.x=t.x-Math.floor(t.x);break;case co:t.x=t.x<0?0:1;break;case lv:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case ov:t.y=t.y-Math.floor(t.y);break;case co:t.y=t.y<0?0:1;break;case lv:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}};Gi.DEFAULT_IMAGE=null;Gi.DEFAULT_MAPPING=qE;Gi.DEFAULT_ANISOTROPY=1;ke=class e{constructor(t=0,n=0,i=0,s=1){e.prototype.isVector4=!0,this.x=t,this.y=n,this.z=i,this.w=s}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,n,i,s){return this.x=t,this.y=n,this.z=i,this.w=s,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,n){switch(t){case 0:this.x=n;break;case 1:this.y=n;break;case 2:this.z=n;break;case 3:this.w=n;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,n){return this.x=t.x+n.x,this.y=t.y+n.y,this.z=t.z+n.z,this.w=t.w+n.w,this}addScaledVector(t,n){return this.x+=t.x*n,this.y+=t.y*n,this.z+=t.z*n,this.w+=t.w*n,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,n){return this.x=t.x-n.x,this.y=t.y-n.y,this.z=t.z-n.z,this.w=t.w-n.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){let n=this.x,i=this.y,s=this.z,a=this.w,r=t.elements;return this.x=r[0]*n+r[4]*i+r[8]*s+r[12]*a,this.y=r[1]*n+r[5]*i+r[9]*s+r[13]*a,this.z=r[2]*n+r[6]*i+r[10]*s+r[14]*a,this.w=r[3]*n+r[7]*i+r[11]*s+r[15]*a,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);let n=Math.sqrt(1-t.w*t.w);return n<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/n,this.y=t.y/n,this.z=t.z/n),this}setAxisAngleFromRotationMatrix(t){let n,i,s,a,l=t.elements,c=l[0],u=l[4],d=l[8],h=l[1],p=l[5],g=l[9],S=l[2],m=l[6],f=l[10];if(Math.abs(u-h)<.01&&Math.abs(d-S)<.01&&Math.abs(g-m)<.01){if(Math.abs(u+h)<.1&&Math.abs(d+S)<.1&&Math.abs(g+m)<.1&&Math.abs(c+p+f-3)<.1)return this.set(1,0,0,0),this;n=Math.PI;let _=(c+1)/2,b=(p+1)/2,D=(f+1)/2,R=(u+h)/4,A=(d+S)/4,N=(g+m)/4;return _>b&&_>D?_<.01?(i=0,s=.707106781,a=.707106781):(i=Math.sqrt(_),s=R/i,a=A/i):b>D?b<.01?(i=.707106781,s=0,a=.707106781):(s=Math.sqrt(b),i=R/s,a=N/s):D<.01?(i=.707106781,s=.707106781,a=0):(a=Math.sqrt(D),i=A/a,s=N/a),this.set(i,s,a,n),this}let y=Math.sqrt((m-g)*(m-g)+(d-S)*(d-S)+(h-u)*(h-u));return Math.abs(y)<.001&&(y=1),this.x=(m-g)/y,this.y=(d-S)/y,this.z=(h-u)/y,this.w=Math.acos((c+p+f-1)/2),this}setFromMatrixPosition(t){let n=t.elements;return this.x=n[12],this.y=n[13],this.z=n[14],this.w=n[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,n){return this.x=Math.max(t.x,Math.min(n.x,this.x)),this.y=Math.max(t.y,Math.min(n.y,this.y)),this.z=Math.max(t.z,Math.min(n.z,this.z)),this.w=Math.max(t.w,Math.min(n.w,this.w)),this}clampScalar(t,n){return this.x=Math.max(t,Math.min(n,this.x)),this.y=Math.max(t,Math.min(n,this.y)),this.z=Math.max(t,Math.min(n,this.z)),this.w=Math.max(t,Math.min(n,this.w)),this}clampLength(t,n){let i=this.length();return this.divideScalar(i||1).multiplyScalar(Math.max(t,Math.min(n,i)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,n){return this.x+=(t.x-this.x)*n,this.y+=(t.y-this.y)*n,this.z+=(t.z-this.z)*n,this.w+=(t.w-this.w)*n,this}lerpVectors(t,n,i){return this.x=t.x+(n.x-t.x)*i,this.y=t.y+(n.y-t.y)*i,this.z=t.z+(n.z-t.z)*i,this.w=t.w+(n.w-t.w)*i,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,n=0){return this.x=t[n],this.y=t[n+1],this.z=t[n+2],this.w=t[n+3],this}toArray(t=[],n=0){return t[n]=this.x,t[n+1]=this.y,t[n+2]=this.z,t[n+3]=this.w,t}fromBufferAttribute(t,n){return this.x=t.getX(n),this.y=t.getY(n),this.z=t.getZ(n),this.w=t.getW(n),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},zv=class extends Ra{constructor(t=1,n=1,i={}){super(),this.isRenderTarget=!0,this.width=t,this.height=n,this.depth=1,this.scissor=new ke(0,0,t,n),this.scissorTest=!1,this.viewport=new ke(0,0,t,n);let s={width:t,height:n,depth:1};i=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:_s,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1},i);let a=new Gi(s,i.mapping,i.wrapS,i.wrapT,i.magFilter,i.minFilter,i.format,i.type,i.anisotropy,i.colorSpace);a.flipY=!1,a.generateMipmaps=i.generateMipmaps,a.internalFormat=i.internalFormat,this.textures=[];let r=i.count;for(let o=0;o<r;o++)this.textures[o]=a.clone(),this.textures[o].isRenderTargetTexture=!0;this.depthBuffer=i.depthBuffer,this.stencilBuffer=i.stencilBuffer,this.resolveDepthBuffer=i.resolveDepthBuffer,this.resolveStencilBuffer=i.resolveStencilBuffer,this.depthTexture=i.depthTexture,this.samples=i.samples}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}setSize(t,n,i=1){if(this.width!==t||this.height!==n||this.depth!==i){this.width=t,this.height=n,this.depth=i;for(let s=0,a=this.textures.length;s<a;s++)this.textures[s].image.width=t,this.textures[s].image.height=n,this.textures[s].image.depth=i;this.dispose()}this.viewport.set(0,0,t,n),this.scissor.set(0,0,t,n)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let i=0,s=t.textures.length;i<s;i++)this.textures[i]=t.textures[i].clone(),this.textures[i].isRenderTargetTexture=!0;let n=Object.assign({},t.texture.image);return this.texture.source=new bd(n),this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,t.depthTexture!==null&&(this.depthTexture=t.depthTexture.clone()),this.samples=t.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}},Zn=class extends zv{constructor(t=1,n=1,i={}){super(t,n,i),this.isWebGLRenderTarget=!0}},Sd=class extends Gi{constructor(t=null,n=1,i=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:n,height:i,depth:s},this.magFilter=is,this.minFilter=is,this.wrapR=co,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}},Bv=class extends Gi{constructor(t=null,n=1,i=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:n,height:i,depth:s},this.magFilter=is,this.minFilter=is,this.wrapR=co,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},Ss=class{constructor(t=0,n=0,i=0,s=1){this.isQuaternion=!0,this._x=t,this._y=n,this._z=i,this._w=s}static slerpFlat(t,n,i,s,a,r,o){let l=i[s+0],c=i[s+1],u=i[s+2],d=i[s+3],h=a[r+0],p=a[r+1],g=a[r+2],S=a[r+3];if(o===0){t[n+0]=l,t[n+1]=c,t[n+2]=u,t[n+3]=d;return}if(o===1){t[n+0]=h,t[n+1]=p,t[n+2]=g,t[n+3]=S;return}if(d!==S||l!==h||c!==p||u!==g){let m=1-o,f=l*h+c*p+u*g+d*S,y=f>=0?1:-1,_=1-f*f;if(_>Number.EPSILON){let D=Math.sqrt(_),R=Math.atan2(D,f*y);m=Math.sin(m*R)/D,o=Math.sin(o*R)/D}let b=o*y;if(l=l*m+h*b,c=c*m+p*b,u=u*m+g*b,d=d*m+S*b,m===1-o){let D=1/Math.sqrt(l*l+c*c+u*u+d*d);l*=D,c*=D,u*=D,d*=D}}t[n]=l,t[n+1]=c,t[n+2]=u,t[n+3]=d}static multiplyQuaternionsFlat(t,n,i,s,a,r){let o=i[s],l=i[s+1],c=i[s+2],u=i[s+3],d=a[r],h=a[r+1],p=a[r+2],g=a[r+3];return t[n]=o*g+u*d+l*p-c*h,t[n+1]=l*g+u*h+c*d-o*p,t[n+2]=c*g+u*p+o*h-l*d,t[n+3]=u*g-o*d-l*h-c*p,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,n,i,s){return this._x=t,this._y=n,this._z=i,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,n=!0){let i=t._x,s=t._y,a=t._z,r=t._order,o=Math.cos,l=Math.sin,c=o(i/2),u=o(s/2),d=o(a/2),h=l(i/2),p=l(s/2),g=l(a/2);switch(r){case"XYZ":this._x=h*u*d+c*p*g,this._y=c*p*d-h*u*g,this._z=c*u*g+h*p*d,this._w=c*u*d-h*p*g;break;case"YXZ":this._x=h*u*d+c*p*g,this._y=c*p*d-h*u*g,this._z=c*u*g-h*p*d,this._w=c*u*d+h*p*g;break;case"ZXY":this._x=h*u*d-c*p*g,this._y=c*p*d+h*u*g,this._z=c*u*g+h*p*d,this._w=c*u*d-h*p*g;break;case"ZYX":this._x=h*u*d-c*p*g,this._y=c*p*d+h*u*g,this._z=c*u*g-h*p*d,this._w=c*u*d+h*p*g;break;case"YZX":this._x=h*u*d+c*p*g,this._y=c*p*d+h*u*g,this._z=c*u*g-h*p*d,this._w=c*u*d-h*p*g;break;case"XZY":this._x=h*u*d-c*p*g,this._y=c*p*d-h*u*g,this._z=c*u*g+h*p*d,this._w=c*u*d+h*p*g;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+r)}return n===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,n){let i=n/2,s=Math.sin(i);return this._x=t.x*s,this._y=t.y*s,this._z=t.z*s,this._w=Math.cos(i),this._onChangeCallback(),this}setFromRotationMatrix(t){let n=t.elements,i=n[0],s=n[4],a=n[8],r=n[1],o=n[5],l=n[9],c=n[2],u=n[6],d=n[10],h=i+o+d;if(h>0){let p=.5/Math.sqrt(h+1);this._w=.25/p,this._x=(u-l)*p,this._y=(a-c)*p,this._z=(r-s)*p}else if(i>o&&i>d){let p=2*Math.sqrt(1+i-o-d);this._w=(u-l)/p,this._x=.25*p,this._y=(s+r)/p,this._z=(a+c)/p}else if(o>d){let p=2*Math.sqrt(1+o-i-d);this._w=(a-c)/p,this._x=(s+r)/p,this._y=.25*p,this._z=(l+u)/p}else{let p=2*Math.sqrt(1+d-i-o);this._w=(r-s)/p,this._x=(a+c)/p,this._y=(l+u)/p,this._z=.25*p}return this._onChangeCallback(),this}setFromUnitVectors(t,n){let i=t.dot(n)+1;return i<Number.EPSILON?(i=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=i):(this._x=0,this._y=-t.z,this._z=t.y,this._w=i)):(this._x=t.y*n.z-t.z*n.y,this._y=t.z*n.x-t.x*n.z,this._z=t.x*n.y-t.y*n.x,this._w=i),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(ni(this.dot(t),-1,1)))}rotateTowards(t,n){let i=this.angleTo(t);if(i===0)return this;let s=Math.min(1,n/i);return this.slerp(t,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,n){let i=t._x,s=t._y,a=t._z,r=t._w,o=n._x,l=n._y,c=n._z,u=n._w;return this._x=i*u+r*o+s*c-a*l,this._y=s*u+r*l+a*o-i*c,this._z=a*u+r*c+i*l-s*o,this._w=r*u-i*o-s*l-a*c,this._onChangeCallback(),this}slerp(t,n){if(n===0)return this;if(n===1)return this.copy(t);let i=this._x,s=this._y,a=this._z,r=this._w,o=r*t._w+i*t._x+s*t._y+a*t._z;if(o<0?(this._w=-t._w,this._x=-t._x,this._y=-t._y,this._z=-t._z,o=-o):this.copy(t),o>=1)return this._w=r,this._x=i,this._y=s,this._z=a,this;let l=1-o*o;if(l<=Number.EPSILON){let p=1-n;return this._w=p*r+n*this._w,this._x=p*i+n*this._x,this._y=p*s+n*this._y,this._z=p*a+n*this._z,this.normalize(),this}let c=Math.sqrt(l),u=Math.atan2(c,o),d=Math.sin((1-n)*u)/c,h=Math.sin(n*u)/c;return this._w=r*d+this._w*h,this._x=i*d+this._x*h,this._y=s*d+this._y*h,this._z=a*d+this._z*h,this._onChangeCallback(),this}slerpQuaternions(t,n,i){return this.copy(t).slerp(n,i)}random(){let t=2*Math.PI*Math.random(),n=2*Math.PI*Math.random(),i=Math.random(),s=Math.sqrt(1-i),a=Math.sqrt(i);return this.set(s*Math.sin(t),s*Math.cos(t),a*Math.sin(n),a*Math.cos(n))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,n=0){return this._x=t[n],this._y=t[n+1],this._z=t[n+2],this._w=t[n+3],this._onChangeCallback(),this}toArray(t=[],n=0){return t[n]=this._x,t[n+1]=this._y,t[n+2]=this._z,t[n+3]=this._w,t}fromBufferAttribute(t,n){return this._x=t.getX(n),this._y=t.getY(n),this._z=t.getZ(n),this._w=t.getW(n),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},W=class e{constructor(t=0,n=0,i=0){e.prototype.isVector3=!0,this.x=t,this.y=n,this.z=i}set(t,n,i){return i===void 0&&(i=this.z),this.x=t,this.y=n,this.z=i,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,n){switch(t){case 0:this.x=n;break;case 1:this.y=n;break;case 2:this.z=n;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,n){return this.x=t.x+n.x,this.y=t.y+n.y,this.z=t.z+n.z,this}addScaledVector(t,n){return this.x+=t.x*n,this.y+=t.y*n,this.z+=t.z*n,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,n){return this.x=t.x-n.x,this.y=t.y-n.y,this.z=t.z-n.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,n){return this.x=t.x*n.x,this.y=t.y*n.y,this.z=t.z*n.z,this}applyEuler(t){return this.applyQuaternion(sE.setFromEuler(t))}applyAxisAngle(t,n){return this.applyQuaternion(sE.setFromAxisAngle(t,n))}applyMatrix3(t){let n=this.x,i=this.y,s=this.z,a=t.elements;return this.x=a[0]*n+a[3]*i+a[6]*s,this.y=a[1]*n+a[4]*i+a[7]*s,this.z=a[2]*n+a[5]*i+a[8]*s,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){let n=this.x,i=this.y,s=this.z,a=t.elements,r=1/(a[3]*n+a[7]*i+a[11]*s+a[15]);return this.x=(a[0]*n+a[4]*i+a[8]*s+a[12])*r,this.y=(a[1]*n+a[5]*i+a[9]*s+a[13])*r,this.z=(a[2]*n+a[6]*i+a[10]*s+a[14])*r,this}applyQuaternion(t){let n=this.x,i=this.y,s=this.z,a=t.x,r=t.y,o=t.z,l=t.w,c=2*(r*s-o*i),u=2*(o*n-a*s),d=2*(a*i-r*n);return this.x=n+l*c+r*d-o*u,this.y=i+l*u+o*c-a*d,this.z=s+l*d+a*u-r*c,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){let n=this.x,i=this.y,s=this.z,a=t.elements;return this.x=a[0]*n+a[4]*i+a[8]*s,this.y=a[1]*n+a[5]*i+a[9]*s,this.z=a[2]*n+a[6]*i+a[10]*s,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,n){return this.x=Math.max(t.x,Math.min(n.x,this.x)),this.y=Math.max(t.y,Math.min(n.y,this.y)),this.z=Math.max(t.z,Math.min(n.z,this.z)),this}clampScalar(t,n){return this.x=Math.max(t,Math.min(n,this.x)),this.y=Math.max(t,Math.min(n,this.y)),this.z=Math.max(t,Math.min(n,this.z)),this}clampLength(t,n){let i=this.length();return this.divideScalar(i||1).multiplyScalar(Math.max(t,Math.min(n,i)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,n){return this.x+=(t.x-this.x)*n,this.y+=(t.y-this.y)*n,this.z+=(t.z-this.z)*n,this}lerpVectors(t,n,i){return this.x=t.x+(n.x-t.x)*i,this.y=t.y+(n.y-t.y)*i,this.z=t.z+(n.z-t.z)*i,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,n){let i=t.x,s=t.y,a=t.z,r=n.x,o=n.y,l=n.z;return this.x=s*l-a*o,this.y=a*r-i*l,this.z=i*o-s*r,this}projectOnVector(t){let n=t.lengthSq();if(n===0)return this.set(0,0,0);let i=t.dot(this)/n;return this.copy(t).multiplyScalar(i)}projectOnPlane(t){return wg.copy(this).projectOnVector(t),this.sub(wg)}reflect(t){return this.sub(wg.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){let n=Math.sqrt(this.lengthSq()*t.lengthSq());if(n===0)return Math.PI/2;let i=this.dot(t)/n;return Math.acos(ni(i,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let n=this.x-t.x,i=this.y-t.y,s=this.z-t.z;return n*n+i*i+s*s}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,n,i){let s=Math.sin(n)*t;return this.x=s*Math.sin(i),this.y=Math.cos(n)*t,this.z=s*Math.cos(i),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,n,i){return this.x=t*Math.sin(n),this.y=i,this.z=t*Math.cos(n),this}setFromMatrixPosition(t){let n=t.elements;return this.x=n[12],this.y=n[13],this.z=n[14],this}setFromMatrixScale(t){let n=this.setFromMatrixColumn(t,0).length(),i=this.setFromMatrixColumn(t,1).length(),s=this.setFromMatrixColumn(t,2).length();return this.x=n,this.y=i,this.z=s,this}setFromMatrixColumn(t,n){return this.fromArray(t.elements,n*4)}setFromMatrix3Column(t,n){return this.fromArray(t.elements,n*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,n=0){return this.x=t[n],this.y=t[n+1],this.z=t[n+2],this}toArray(t=[],n=0){return t[n]=this.x,t[n+1]=this.y,t[n+2]=this.z,t}fromBufferAttribute(t,n){return this.x=t.getX(n),this.y=t.getY(n),this.z=t.getZ(n),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let t=Math.random()*Math.PI*2,n=Math.random()*2-1,i=Math.sqrt(1-n*n);return this.x=i*Math.cos(t),this.y=n,this.z=i*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},wg=new W,sE=new Ss,fo=class{constructor(t=new W(1/0,1/0,1/0),n=new W(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=n}set(t,n){return this.min.copy(t),this.max.copy(n),this}setFromArray(t){this.makeEmpty();for(let n=0,i=t.length;n<i;n+=3)this.expandByPoint(ms.fromArray(t,n));return this}setFromBufferAttribute(t){this.makeEmpty();for(let n=0,i=t.count;n<i;n++)this.expandByPoint(ms.fromBufferAttribute(t,n));return this}setFromPoints(t){this.makeEmpty();for(let n=0,i=t.length;n<i;n++)this.expandByPoint(t[n]);return this}setFromCenterAndSize(t,n){let i=ms.copy(n).multiplyScalar(.5);return this.min.copy(t).sub(i),this.max.copy(t).add(i),this}setFromObject(t,n=!1){return this.makeEmpty(),this.expandByObject(t,n)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,n=!1){t.updateWorldMatrix(!1,!1);let i=t.geometry;if(i!==void 0){let a=i.getAttribute("position");if(n===!0&&a!==void 0&&t.isInstancedMesh!==!0)for(let r=0,o=a.count;r<o;r++)t.isMesh===!0?t.getVertexPosition(r,ms):ms.fromBufferAttribute(a,r),ms.applyMatrix4(t.matrixWorld),this.expandByPoint(ms);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),Hf.copy(t.boundingBox)):(i.boundingBox===null&&i.computeBoundingBox(),Hf.copy(i.boundingBox)),Hf.applyMatrix4(t.matrixWorld),this.union(Hf)}let s=t.children;for(let a=0,r=s.length;a<r;a++)this.expandByObject(s[a],n);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,n){return n.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,ms),ms.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let n,i;return t.normal.x>0?(n=t.normal.x*this.min.x,i=t.normal.x*this.max.x):(n=t.normal.x*this.max.x,i=t.normal.x*this.min.x),t.normal.y>0?(n+=t.normal.y*this.min.y,i+=t.normal.y*this.max.y):(n+=t.normal.y*this.max.y,i+=t.normal.y*this.min.y),t.normal.z>0?(n+=t.normal.z*this.min.z,i+=t.normal.z*this.max.z):(n+=t.normal.z*this.max.z,i+=t.normal.z*this.min.z),n<=-t.constant&&i>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(Tu),Vf.subVectors(this.max,Tu),Ol.subVectors(t.a,Tu),Il.subVectors(t.b,Tu),Pl.subVectors(t.c,Tu),gr.subVectors(Il,Ol),vr.subVectors(Pl,Il),$r.subVectors(Ol,Pl);let n=[0,-gr.z,gr.y,0,-vr.z,vr.y,0,-$r.z,$r.y,gr.z,0,-gr.x,vr.z,0,-vr.x,$r.z,0,-$r.x,-gr.y,gr.x,0,-vr.y,vr.x,0,-$r.y,$r.x,0];return!Rg(n,Ol,Il,Pl,Vf)||(n=[1,0,0,0,1,0,0,0,1],!Rg(n,Ol,Il,Pl,Vf))?!1:(Gf.crossVectors(gr,vr),n=[Gf.x,Gf.y,Gf.z],Rg(n,Ol,Il,Pl,Vf))}clampPoint(t,n){return n.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,ms).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(ms).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(_a[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),_a[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),_a[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),_a[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),_a[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),_a[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),_a[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),_a[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(_a),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}},_a=[new W,new W,new W,new W,new W,new W,new W,new W],ms=new W,Hf=new fo,Ol=new W,Il=new W,Pl=new W,gr=new W,vr=new W,$r=new W,Tu=new W,Vf=new W,Gf=new W,to=new W;b3=new fo,Au=new W,Cg=new W,nc=class{constructor(t=new W,n=-1){this.isSphere=!0,this.center=t,this.radius=n}set(t,n){return this.center.copy(t),this.radius=n,this}setFromPoints(t,n){let i=this.center;n!==void 0?i.copy(n):b3.setFromPoints(t).getCenter(i);let s=0;for(let a=0,r=t.length;a<r;a++)s=Math.max(s,i.distanceToSquared(t[a]));return this.radius=Math.sqrt(s),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){let n=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=n*n}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,n){let i=this.center.distanceToSquared(t);return n.copy(t),i>this.radius*this.radius&&(n.sub(this.center).normalize(),n.multiplyScalar(this.radius).add(this.center)),n}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;Au.subVectors(t,this.center);let n=Au.lengthSq();if(n>this.radius*this.radius){let i=Math.sqrt(n),s=(i-this.radius)*.5;this.center.addScaledVector(Au,s/i),this.radius+=s}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(Cg.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(Au.copy(t.center).add(Cg)),this.expandByPoint(Au.copy(t.center).sub(Cg))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}},xa=new W,Dg=new W,kf=new W,yr=new W,Ng=new W,Xf=new W,Ug=new W,ic=class{constructor(t=new W,n=new W(0,0,-1)){this.origin=t,this.direction=n}set(t,n){return this.origin.copy(t),this.direction.copy(n),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,n){return n.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,xa)),this}closestPointToPoint(t,n){n.subVectors(t,this.origin);let i=n.dot(this.direction);return i<0?n.copy(this.origin):n.copy(this.origin).addScaledVector(this.direction,i)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){let n=xa.subVectors(t,this.origin).dot(this.direction);return n<0?this.origin.distanceToSquared(t):(xa.copy(this.origin).addScaledVector(this.direction,n),xa.distanceToSquared(t))}distanceSqToSegment(t,n,i,s){Dg.copy(t).add(n).multiplyScalar(.5),kf.copy(n).sub(t).normalize(),yr.copy(this.origin).sub(Dg);let a=t.distanceTo(n)*.5,r=-this.direction.dot(kf),o=yr.dot(this.direction),l=-yr.dot(kf),c=yr.lengthSq(),u=Math.abs(1-r*r),d,h,p,g;if(u>0)if(d=r*l-o,h=r*o-l,g=a*u,d>=0)if(h>=-g)if(h<=g){let S=1/u;d*=S,h*=S,p=d*(d+r*h+2*o)+h*(r*d+h+2*l)+c}else h=a,d=Math.max(0,-(r*h+o)),p=-d*d+h*(h+2*l)+c;else h=-a,d=Math.max(0,-(r*h+o)),p=-d*d+h*(h+2*l)+c;else h<=-g?(d=Math.max(0,-(-r*a+o)),h=d>0?-a:Math.min(Math.max(-a,-l),a),p=-d*d+h*(h+2*l)+c):h<=g?(d=0,h=Math.min(Math.max(-a,-l),a),p=h*(h+2*l)+c):(d=Math.max(0,-(r*a+o)),h=d>0?a:Math.min(Math.max(-a,-l),a),p=-d*d+h*(h+2*l)+c);else h=r>0?-a:a,d=Math.max(0,-(r*h+o)),p=-d*d+h*(h+2*l)+c;return i&&i.copy(this.origin).addScaledVector(this.direction,d),s&&s.copy(Dg).addScaledVector(kf,h),p}intersectSphere(t,n){xa.subVectors(t.center,this.origin);let i=xa.dot(this.direction),s=xa.dot(xa)-i*i,a=t.radius*t.radius;if(s>a)return null;let r=Math.sqrt(a-s),o=i-r,l=i+r;return l<0?null:o<0?this.at(l,n):this.at(o,n)}intersectsSphere(t){return this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){let n=t.normal.dot(this.direction);if(n===0)return t.distanceToPoint(this.origin)===0?0:null;let i=-(this.origin.dot(t.normal)+t.constant)/n;return i>=0?i:null}intersectPlane(t,n){let i=this.distanceToPlane(t);return i===null?null:this.at(i,n)}intersectsPlane(t){let n=t.distanceToPoint(this.origin);return n===0||t.normal.dot(this.direction)*n<0}intersectBox(t,n){let i,s,a,r,o,l,c=1/this.direction.x,u=1/this.direction.y,d=1/this.direction.z,h=this.origin;return c>=0?(i=(t.min.x-h.x)*c,s=(t.max.x-h.x)*c):(i=(t.max.x-h.x)*c,s=(t.min.x-h.x)*c),u>=0?(a=(t.min.y-h.y)*u,r=(t.max.y-h.y)*u):(a=(t.max.y-h.y)*u,r=(t.min.y-h.y)*u),i>r||a>s||((a>i||isNaN(i))&&(i=a),(r<s||isNaN(s))&&(s=r),d>=0?(o=(t.min.z-h.z)*d,l=(t.max.z-h.z)*d):(o=(t.max.z-h.z)*d,l=(t.min.z-h.z)*d),i>l||o>s)||((o>i||i!==i)&&(i=o),(l<s||s!==s)&&(s=l),s<0)?null:this.at(i>=0?i:s,n)}intersectsBox(t){return this.intersectBox(t,xa)!==null}intersectTriangle(t,n,i,s,a){Ng.subVectors(n,t),Xf.subVectors(i,t),Ug.crossVectors(Ng,Xf);let r=this.direction.dot(Ug),o;if(r>0){if(s)return null;o=1}else if(r<0)o=-1,r=-r;else return null;yr.subVectors(this.origin,t);let l=o*this.direction.dot(Xf.crossVectors(yr,Xf));if(l<0)return null;let c=o*this.direction.dot(Ng.cross(yr));if(c<0||l+c>r)return null;let u=-o*yr.dot(Ug);return u<0?null:this.at(u/r,a)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},pn=class e{constructor(t,n,i,s,a,r,o,l,c,u,d,h,p,g,S,m){e.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,n,i,s,a,r,o,l,c,u,d,h,p,g,S,m)}set(t,n,i,s,a,r,o,l,c,u,d,h,p,g,S,m){let f=this.elements;return f[0]=t,f[4]=n,f[8]=i,f[12]=s,f[1]=a,f[5]=r,f[9]=o,f[13]=l,f[2]=c,f[6]=u,f[10]=d,f[14]=h,f[3]=p,f[7]=g,f[11]=S,f[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new e().fromArray(this.elements)}copy(t){let n=this.elements,i=t.elements;return n[0]=i[0],n[1]=i[1],n[2]=i[2],n[3]=i[3],n[4]=i[4],n[5]=i[5],n[6]=i[6],n[7]=i[7],n[8]=i[8],n[9]=i[9],n[10]=i[10],n[11]=i[11],n[12]=i[12],n[13]=i[13],n[14]=i[14],n[15]=i[15],this}copyPosition(t){let n=this.elements,i=t.elements;return n[12]=i[12],n[13]=i[13],n[14]=i[14],this}setFromMatrix3(t){let n=t.elements;return this.set(n[0],n[3],n[6],0,n[1],n[4],n[7],0,n[2],n[5],n[8],0,0,0,0,1),this}extractBasis(t,n,i){return t.setFromMatrixColumn(this,0),n.setFromMatrixColumn(this,1),i.setFromMatrixColumn(this,2),this}makeBasis(t,n,i){return this.set(t.x,n.x,i.x,0,t.y,n.y,i.y,0,t.z,n.z,i.z,0,0,0,0,1),this}extractRotation(t){let n=this.elements,i=t.elements,s=1/zl.setFromMatrixColumn(t,0).length(),a=1/zl.setFromMatrixColumn(t,1).length(),r=1/zl.setFromMatrixColumn(t,2).length();return n[0]=i[0]*s,n[1]=i[1]*s,n[2]=i[2]*s,n[3]=0,n[4]=i[4]*a,n[5]=i[5]*a,n[6]=i[6]*a,n[7]=0,n[8]=i[8]*r,n[9]=i[9]*r,n[10]=i[10]*r,n[11]=0,n[12]=0,n[13]=0,n[14]=0,n[15]=1,this}makeRotationFromEuler(t){let n=this.elements,i=t.x,s=t.y,a=t.z,r=Math.cos(i),o=Math.sin(i),l=Math.cos(s),c=Math.sin(s),u=Math.cos(a),d=Math.sin(a);if(t.order==="XYZ"){let h=r*u,p=r*d,g=o*u,S=o*d;n[0]=l*u,n[4]=-l*d,n[8]=c,n[1]=p+g*c,n[5]=h-S*c,n[9]=-o*l,n[2]=S-h*c,n[6]=g+p*c,n[10]=r*l}else if(t.order==="YXZ"){let h=l*u,p=l*d,g=c*u,S=c*d;n[0]=h+S*o,n[4]=g*o-p,n[8]=r*c,n[1]=r*d,n[5]=r*u,n[9]=-o,n[2]=p*o-g,n[6]=S+h*o,n[10]=r*l}else if(t.order==="ZXY"){let h=l*u,p=l*d,g=c*u,S=c*d;n[0]=h-S*o,n[4]=-r*d,n[8]=g+p*o,n[1]=p+g*o,n[5]=r*u,n[9]=S-h*o,n[2]=-r*c,n[6]=o,n[10]=r*l}else if(t.order==="ZYX"){let h=r*u,p=r*d,g=o*u,S=o*d;n[0]=l*u,n[4]=g*c-p,n[8]=h*c+S,n[1]=l*d,n[5]=S*c+h,n[9]=p*c-g,n[2]=-c,n[6]=o*l,n[10]=r*l}else if(t.order==="YZX"){let h=r*l,p=r*c,g=o*l,S=o*c;n[0]=l*u,n[4]=S-h*d,n[8]=g*d+p,n[1]=d,n[5]=r*u,n[9]=-o*u,n[2]=-c*u,n[6]=p*d+g,n[10]=h-S*d}else if(t.order==="XZY"){let h=r*l,p=r*c,g=o*l,S=o*c;n[0]=l*u,n[4]=-d,n[8]=c*u,n[1]=h*d+S,n[5]=r*u,n[9]=p*d-g,n[2]=g*d-p,n[6]=o*u,n[10]=S*d+h}return n[3]=0,n[7]=0,n[11]=0,n[12]=0,n[13]=0,n[14]=0,n[15]=1,this}makeRotationFromQuaternion(t){return this.compose(S3,t,M3)}lookAt(t,n,i){let s=this.elements;return Hi.subVectors(t,n),Hi.lengthSq()===0&&(Hi.z=1),Hi.normalize(),_r.crossVectors(i,Hi),_r.lengthSq()===0&&(Math.abs(i.z)===1?Hi.x+=1e-4:Hi.z+=1e-4,Hi.normalize(),_r.crossVectors(i,Hi)),_r.normalize(),Wf.crossVectors(Hi,_r),s[0]=_r.x,s[4]=Wf.x,s[8]=Hi.x,s[1]=_r.y,s[5]=Wf.y,s[9]=Hi.y,s[2]=_r.z,s[6]=Wf.z,s[10]=Hi.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,n){let i=t.elements,s=n.elements,a=this.elements,r=i[0],o=i[4],l=i[8],c=i[12],u=i[1],d=i[5],h=i[9],p=i[13],g=i[2],S=i[6],m=i[10],f=i[14],y=i[3],_=i[7],b=i[11],D=i[15],R=s[0],A=s[4],N=s[8],et=s[12],v=s[1],M=s[5],F=s[9],q=s[13],K=s[2],$=s[6],B=s[10],ct=s[14],Z=s[3],wt=s[7],mt=s[11],ft=s[15];return a[0]=r*R+o*v+l*K+c*Z,a[4]=r*A+o*M+l*$+c*wt,a[8]=r*N+o*F+l*B+c*mt,a[12]=r*et+o*q+l*ct+c*ft,a[1]=u*R+d*v+h*K+p*Z,a[5]=u*A+d*M+h*$+p*wt,a[9]=u*N+d*F+h*B+p*mt,a[13]=u*et+d*q+h*ct+p*ft,a[2]=g*R+S*v+m*K+f*Z,a[6]=g*A+S*M+m*$+f*wt,a[10]=g*N+S*F+m*B+f*mt,a[14]=g*et+S*q+m*ct+f*ft,a[3]=y*R+_*v+b*K+D*Z,a[7]=y*A+_*M+b*$+D*wt,a[11]=y*N+_*F+b*B+D*mt,a[15]=y*et+_*q+b*ct+D*ft,this}multiplyScalar(t){let n=this.elements;return n[0]*=t,n[4]*=t,n[8]*=t,n[12]*=t,n[1]*=t,n[5]*=t,n[9]*=t,n[13]*=t,n[2]*=t,n[6]*=t,n[10]*=t,n[14]*=t,n[3]*=t,n[7]*=t,n[11]*=t,n[15]*=t,this}determinant(){let t=this.elements,n=t[0],i=t[4],s=t[8],a=t[12],r=t[1],o=t[5],l=t[9],c=t[13],u=t[2],d=t[6],h=t[10],p=t[14],g=t[3],S=t[7],m=t[11],f=t[15];return g*(+a*l*d-s*c*d-a*o*h+i*c*h+s*o*p-i*l*p)+S*(+n*l*p-n*c*h+a*r*h-s*r*p+s*c*u-a*l*u)+m*(+n*c*d-n*o*p-a*r*d+i*r*p+a*o*u-i*c*u)+f*(-s*o*u-n*l*d+n*o*h+s*r*d-i*r*h+i*l*u)}transpose(){let t=this.elements,n;return n=t[1],t[1]=t[4],t[4]=n,n=t[2],t[2]=t[8],t[8]=n,n=t[6],t[6]=t[9],t[9]=n,n=t[3],t[3]=t[12],t[12]=n,n=t[7],t[7]=t[13],t[13]=n,n=t[11],t[11]=t[14],t[14]=n,this}setPosition(t,n,i){let s=this.elements;return t.isVector3?(s[12]=t.x,s[13]=t.y,s[14]=t.z):(s[12]=t,s[13]=n,s[14]=i),this}invert(){let t=this.elements,n=t[0],i=t[1],s=t[2],a=t[3],r=t[4],o=t[5],l=t[6],c=t[7],u=t[8],d=t[9],h=t[10],p=t[11],g=t[12],S=t[13],m=t[14],f=t[15],y=d*m*c-S*h*c+S*l*p-o*m*p-d*l*f+o*h*f,_=g*h*c-u*m*c-g*l*p+r*m*p+u*l*f-r*h*f,b=u*S*c-g*d*c+g*o*p-r*S*p-u*o*f+r*d*f,D=g*d*l-u*S*l-g*o*h+r*S*h+u*o*m-r*d*m,R=n*y+i*_+s*b+a*D;if(R===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let A=1/R;return t[0]=y*A,t[1]=(S*h*a-d*m*a-S*s*p+i*m*p+d*s*f-i*h*f)*A,t[2]=(o*m*a-S*l*a+S*s*c-i*m*c-o*s*f+i*l*f)*A,t[3]=(d*l*a-o*h*a-d*s*c+i*h*c+o*s*p-i*l*p)*A,t[4]=_*A,t[5]=(u*m*a-g*h*a+g*s*p-n*m*p-u*s*f+n*h*f)*A,t[6]=(g*l*a-r*m*a-g*s*c+n*m*c+r*s*f-n*l*f)*A,t[7]=(r*h*a-u*l*a+u*s*c-n*h*c-r*s*p+n*l*p)*A,t[8]=b*A,t[9]=(g*d*a-u*S*a-g*i*p+n*S*p+u*i*f-n*d*f)*A,t[10]=(r*S*a-g*o*a+g*i*c-n*S*c-r*i*f+n*o*f)*A,t[11]=(u*o*a-r*d*a-u*i*c+n*d*c+r*i*p-n*o*p)*A,t[12]=D*A,t[13]=(u*S*s-g*d*s+g*i*h-n*S*h-u*i*m+n*d*m)*A,t[14]=(g*o*s-r*S*s-g*i*l+n*S*l+r*i*m-n*o*m)*A,t[15]=(r*d*s-u*o*s+u*i*l-n*d*l-r*i*h+n*o*h)*A,this}scale(t){let n=this.elements,i=t.x,s=t.y,a=t.z;return n[0]*=i,n[4]*=s,n[8]*=a,n[1]*=i,n[5]*=s,n[9]*=a,n[2]*=i,n[6]*=s,n[10]*=a,n[3]*=i,n[7]*=s,n[11]*=a,this}getMaxScaleOnAxis(){let t=this.elements,n=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],i=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],s=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(n,i,s))}makeTranslation(t,n,i){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,n,0,0,1,i,0,0,0,1),this}makeRotationX(t){let n=Math.cos(t),i=Math.sin(t);return this.set(1,0,0,0,0,n,-i,0,0,i,n,0,0,0,0,1),this}makeRotationY(t){let n=Math.cos(t),i=Math.sin(t);return this.set(n,0,i,0,0,1,0,0,-i,0,n,0,0,0,0,1),this}makeRotationZ(t){let n=Math.cos(t),i=Math.sin(t);return this.set(n,-i,0,0,i,n,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,n){let i=Math.cos(n),s=Math.sin(n),a=1-i,r=t.x,o=t.y,l=t.z,c=a*r,u=a*o;return this.set(c*r+i,c*o-s*l,c*l+s*o,0,c*o+s*l,u*o+i,u*l-s*r,0,c*l-s*o,u*l+s*r,a*l*l+i,0,0,0,0,1),this}makeScale(t,n,i){return this.set(t,0,0,0,0,n,0,0,0,0,i,0,0,0,0,1),this}makeShear(t,n,i,s,a,r){return this.set(1,i,a,0,t,1,r,0,n,s,1,0,0,0,0,1),this}compose(t,n,i){let s=this.elements,a=n._x,r=n._y,o=n._z,l=n._w,c=a+a,u=r+r,d=o+o,h=a*c,p=a*u,g=a*d,S=r*u,m=r*d,f=o*d,y=l*c,_=l*u,b=l*d,D=i.x,R=i.y,A=i.z;return s[0]=(1-(S+f))*D,s[1]=(p+b)*D,s[2]=(g-_)*D,s[3]=0,s[4]=(p-b)*R,s[5]=(1-(h+f))*R,s[6]=(m+y)*R,s[7]=0,s[8]=(g+_)*A,s[9]=(m-y)*A,s[10]=(1-(h+S))*A,s[11]=0,s[12]=t.x,s[13]=t.y,s[14]=t.z,s[15]=1,this}decompose(t,n,i){let s=this.elements,a=zl.set(s[0],s[1],s[2]).length(),r=zl.set(s[4],s[5],s[6]).length(),o=zl.set(s[8],s[9],s[10]).length();this.determinant()<0&&(a=-a),t.x=s[12],t.y=s[13],t.z=s[14],gs.copy(this);let c=1/a,u=1/r,d=1/o;return gs.elements[0]*=c,gs.elements[1]*=c,gs.elements[2]*=c,gs.elements[4]*=u,gs.elements[5]*=u,gs.elements[6]*=u,gs.elements[8]*=d,gs.elements[9]*=d,gs.elements[10]*=d,n.setFromRotationMatrix(gs),i.x=a,i.y=r,i.z=o,this}makePerspective(t,n,i,s,a,r,o=Aa){let l=this.elements,c=2*a/(n-t),u=2*a/(i-s),d=(n+t)/(n-t),h=(i+s)/(i-s),p,g;if(o===Aa)p=-(r+a)/(r-a),g=-2*r*a/(r-a);else if(o===_d)p=-r/(r-a),g=-r*a/(r-a);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return l[0]=c,l[4]=0,l[8]=d,l[12]=0,l[1]=0,l[5]=u,l[9]=h,l[13]=0,l[2]=0,l[6]=0,l[10]=p,l[14]=g,l[3]=0,l[7]=0,l[11]=-1,l[15]=0,this}makeOrthographic(t,n,i,s,a,r,o=Aa){let l=this.elements,c=1/(n-t),u=1/(i-s),d=1/(r-a),h=(n+t)*c,p=(i+s)*u,g,S;if(o===Aa)g=(r+a)*d,S=-2*d;else if(o===_d)g=a*d,S=-1*d;else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return l[0]=2*c,l[4]=0,l[8]=0,l[12]=-h,l[1]=0,l[5]=2*u,l[9]=0,l[13]=-p,l[2]=0,l[6]=0,l[10]=S,l[14]=-g,l[3]=0,l[7]=0,l[11]=0,l[15]=1,this}equals(t){let n=this.elements,i=t.elements;for(let s=0;s<16;s++)if(n[s]!==i[s])return!1;return!0}fromArray(t,n=0){for(let i=0;i<16;i++)this.elements[i]=t[i+n];return this}toArray(t=[],n=0){let i=this.elements;return t[n]=i[0],t[n+1]=i[1],t[n+2]=i[2],t[n+3]=i[3],t[n+4]=i[4],t[n+5]=i[5],t[n+6]=i[6],t[n+7]=i[7],t[n+8]=i[8],t[n+9]=i[9],t[n+10]=i[10],t[n+11]=i[11],t[n+12]=i[12],t[n+13]=i[13],t[n+14]=i[14],t[n+15]=i[15],t}},zl=new W,gs=new pn,S3=new W(0,0,0),M3=new W(1,1,1),_r=new W,Wf=new W,Hi=new W,aE=new pn,rE=new Ss,Ca=class e{constructor(t=0,n=0,i=0,s=e.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=n,this._z=i,this._order=s}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,n,i,s=this._order){return this._x=t,this._y=n,this._z=i,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,n=this._order,i=!0){let s=t.elements,a=s[0],r=s[4],o=s[8],l=s[1],c=s[5],u=s[9],d=s[2],h=s[6],p=s[10];switch(n){case"XYZ":this._y=Math.asin(ni(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-u,p),this._z=Math.atan2(-r,a)):(this._x=Math.atan2(h,c),this._z=0);break;case"YXZ":this._x=Math.asin(-ni(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(o,p),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-d,a),this._z=0);break;case"ZXY":this._x=Math.asin(ni(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(-d,p),this._z=Math.atan2(-r,c)):(this._y=0,this._z=Math.atan2(l,a));break;case"ZYX":this._y=Math.asin(-ni(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(h,p),this._z=Math.atan2(l,a)):(this._x=0,this._z=Math.atan2(-r,c));break;case"YZX":this._z=Math.asin(ni(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-u,c),this._y=Math.atan2(-d,a)):(this._x=0,this._y=Math.atan2(o,p));break;case"XZY":this._z=Math.asin(-ni(r,-1,1)),Math.abs(r)<.9999999?(this._x=Math.atan2(h,c),this._y=Math.atan2(o,a)):(this._x=Math.atan2(-u,p),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+n)}return this._order=n,i===!0&&this._onChangeCallback(),this}setFromQuaternion(t,n,i){return aE.makeRotationFromQuaternion(t),this.setFromRotationMatrix(aE,n,i)}setFromVector3(t,n=this._order){return this.set(t.x,t.y,t.z,n)}reorder(t){return rE.setFromEuler(this),this.setFromQuaternion(rE,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],n=0){return t[n]=this._x,t[n+1]=this._y,t[n+2]=this._z,t[n+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};Ca.DEFAULT_ORDER="XYZ";Md=class{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}},E3=0,oE=new W,Bl=new Ss,ba=new pn,qf=new W,wu=new W,T3=new W,A3=new Ss,lE=new W(1,0,0),cE=new W(0,1,0),uE=new W(0,0,1),hE={type:"added"},w3={type:"removed"},Fl={type:"childadded",child:null},Lg={type:"childremoved",child:null},ss=class e extends Ra{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:E3++}),this.uuid=oc(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=e.DEFAULT_UP.clone();let t=new W,n=new Ca,i=new Ss,s=new W(1,1,1);function a(){i.setFromEuler(n,!1)}function r(){n.setFromQuaternion(i,void 0,!1)}n._onChange(a),i._onChange(r),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:n},quaternion:{configurable:!0,enumerable:!0,value:i},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new pn},normalMatrix:{value:new ye}}),this.matrix=new pn,this.matrixWorld=new pn,this.matrixAutoUpdate=e.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=e.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Md,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,n){this.quaternion.setFromAxisAngle(t,n)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,n){return Bl.setFromAxisAngle(t,n),this.quaternion.multiply(Bl),this}rotateOnWorldAxis(t,n){return Bl.setFromAxisAngle(t,n),this.quaternion.premultiply(Bl),this}rotateX(t){return this.rotateOnAxis(lE,t)}rotateY(t){return this.rotateOnAxis(cE,t)}rotateZ(t){return this.rotateOnAxis(uE,t)}translateOnAxis(t,n){return oE.copy(t).applyQuaternion(this.quaternion),this.position.add(oE.multiplyScalar(n)),this}translateX(t){return this.translateOnAxis(lE,t)}translateY(t){return this.translateOnAxis(cE,t)}translateZ(t){return this.translateOnAxis(uE,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(ba.copy(this.matrixWorld).invert())}lookAt(t,n,i){t.isVector3?qf.copy(t):qf.set(t,n,i);let s=this.parent;this.updateWorldMatrix(!0,!1),wu.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?ba.lookAt(wu,qf,this.up):ba.lookAt(qf,wu,this.up),this.quaternion.setFromRotationMatrix(ba),s&&(ba.extractRotation(s.matrixWorld),Bl.setFromRotationMatrix(ba),this.quaternion.premultiply(Bl.invert()))}add(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.add(arguments[n]);return this}return t===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(hE),Fl.child=t,this.dispatchEvent(Fl),Fl.child=null):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let i=0;i<arguments.length;i++)this.remove(arguments[i]);return this}let n=this.children.indexOf(t);return n!==-1&&(t.parent=null,this.children.splice(n,1),t.dispatchEvent(w3),Lg.child=t,this.dispatchEvent(Lg),Lg.child=null),this}removeFromParent(){let t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),ba.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),ba.multiply(t.parent.matrixWorld)),t.applyMatrix4(ba),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(hE),Fl.child=t,this.dispatchEvent(Fl),Fl.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,n){if(this[t]===n)return this;for(let i=0,s=this.children.length;i<s;i++){let r=this.children[i].getObjectByProperty(t,n);if(r!==void 0)return r}}getObjectsByProperty(t,n,i=[]){this[t]===n&&i.push(this);let s=this.children;for(let a=0,r=s.length;a<r;a++)s[a].getObjectsByProperty(t,n,i);return i}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(wu,t,T3),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(wu,A3,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);let n=this.matrixWorld.elements;return t.set(n[8],n[9],n[10]).normalize()}raycast(){}traverse(t){t(this);let n=this.children;for(let i=0,s=n.length;i<s;i++)n[i].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);let n=this.children;for(let i=0,s=n.length;i<s;i++)n[i].traverseVisible(t)}traverseAncestors(t){let n=this.parent;n!==null&&(t(n),n.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);let n=this.children;for(let i=0,s=n.length;i<s;i++)n[i].updateMatrixWorld(t)}updateWorldMatrix(t,n){let i=this.parent;if(t===!0&&i!==null&&i.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),n===!0){let s=this.children;for(let a=0,r=s.length;a<r;a++)s[a].updateWorldMatrix(!1,!0)}}toJSON(t){let n=t===void 0||typeof t=="string",i={};n&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},i.metadata={version:4.6,type:"Object",generator:"Object3D.toJSON"});let s={};s.uuid=this.uuid,s.type=this.type,this.name!==""&&(s.name=this.name),this.castShadow===!0&&(s.castShadow=!0),this.receiveShadow===!0&&(s.receiveShadow=!0),this.visible===!1&&(s.visible=!1),this.frustumCulled===!1&&(s.frustumCulled=!1),this.renderOrder!==0&&(s.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(s.matrixAutoUpdate=!1),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.visibility=this._visibility,s.active=this._active,s.bounds=this._bounds.map(o=>({boxInitialized:o.boxInitialized,boxMin:o.box.min.toArray(),boxMax:o.box.max.toArray(),sphereInitialized:o.sphereInitialized,sphereRadius:o.sphere.radius,sphereCenter:o.sphere.center.toArray()})),s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.geometryCount=this._geometryCount,s.matricesTexture=this._matricesTexture.toJSON(t),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(s.boundingSphere={center:s.boundingSphere.center.toArray(),radius:s.boundingSphere.radius}),this.boundingBox!==null&&(s.boundingBox={min:s.boundingBox.min.toArray(),max:s.boundingBox.max.toArray()}));function a(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(t)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=a(t.geometries,this.geometry);let o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){let l=o.shapes;if(Array.isArray(l))for(let c=0,u=l.length;c<u;c++){let d=l[c];a(t.shapes,d)}else a(t.shapes,l)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(a(t.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(a(t.materials,this.material[l]));s.material=o}else s.material=a(t.materials,this.material);if(this.children.length>0){s.children=[];for(let o=0;o<this.children.length;o++)s.children.push(this.children[o].toJSON(t).object)}if(this.animations.length>0){s.animations=[];for(let o=0;o<this.animations.length;o++){let l=this.animations[o];s.animations.push(a(t.animations,l))}}if(n){let o=r(t.geometries),l=r(t.materials),c=r(t.textures),u=r(t.images),d=r(t.shapes),h=r(t.skeletons),p=r(t.animations),g=r(t.nodes);o.length>0&&(i.geometries=o),l.length>0&&(i.materials=l),c.length>0&&(i.textures=c),u.length>0&&(i.images=u),d.length>0&&(i.shapes=d),h.length>0&&(i.skeletons=h),p.length>0&&(i.animations=p),g.length>0&&(i.nodes=g)}return i.object=s,i;function r(o){let l=[];for(let c in o){let u=o[c];delete u.metadata,l.push(u)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,n=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),n===!0)for(let i=0;i<t.children.length;i++){let s=t.children[i];this.add(s.clone())}return this}};ss.DEFAULT_UP=new W(0,1,0);ss.DEFAULT_MATRIX_AUTO_UPDATE=!0;ss.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;vs=new W,Sa=new W,Og=new W,Ma=new W,Hl=new W,Vl=new W,fE=new W,Ig=new W,Pg=new W,zg=new W,Bg=new ke,Fg=new ke,Hg=new ke,oo=class e{constructor(t=new W,n=new W,i=new W){this.a=t,this.b=n,this.c=i}static getNormal(t,n,i,s){s.subVectors(i,n),vs.subVectors(t,n),s.cross(vs);let a=s.lengthSq();return a>0?s.multiplyScalar(1/Math.sqrt(a)):s.set(0,0,0)}static getBarycoord(t,n,i,s,a){vs.subVectors(s,n),Sa.subVectors(i,n),Og.subVectors(t,n);let r=vs.dot(vs),o=vs.dot(Sa),l=vs.dot(Og),c=Sa.dot(Sa),u=Sa.dot(Og),d=r*c-o*o;if(d===0)return a.set(0,0,0),null;let h=1/d,p=(c*l-o*u)*h,g=(r*u-o*l)*h;return a.set(1-p-g,g,p)}static containsPoint(t,n,i,s){return this.getBarycoord(t,n,i,s,Ma)===null?!1:Ma.x>=0&&Ma.y>=0&&Ma.x+Ma.y<=1}static getInterpolation(t,n,i,s,a,r,o,l){return this.getBarycoord(t,n,i,s,Ma)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(a,Ma.x),l.addScaledVector(r,Ma.y),l.addScaledVector(o,Ma.z),l)}static getInterpolatedAttribute(t,n,i,s,a,r){return Bg.setScalar(0),Fg.setScalar(0),Hg.setScalar(0),Bg.fromBufferAttribute(t,n),Fg.fromBufferAttribute(t,i),Hg.fromBufferAttribute(t,s),r.setScalar(0),r.addScaledVector(Bg,a.x),r.addScaledVector(Fg,a.y),r.addScaledVector(Hg,a.z),r}static isFrontFacing(t,n,i,s){return vs.subVectors(i,n),Sa.subVectors(t,n),vs.cross(Sa).dot(s)<0}set(t,n,i){return this.a.copy(t),this.b.copy(n),this.c.copy(i),this}setFromPointsAndIndices(t,n,i,s){return this.a.copy(t[n]),this.b.copy(t[i]),this.c.copy(t[s]),this}setFromAttributeAndIndices(t,n,i,s){return this.a.fromBufferAttribute(t,n),this.b.fromBufferAttribute(t,i),this.c.fromBufferAttribute(t,s),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return vs.subVectors(this.c,this.b),Sa.subVectors(this.a,this.b),vs.cross(Sa).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return e.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,n){return e.getBarycoord(t,this.a,this.b,this.c,n)}getInterpolation(t,n,i,s,a){return e.getInterpolation(t,this.a,this.b,this.c,n,i,s,a)}containsPoint(t){return e.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return e.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,n){let i=this.a,s=this.b,a=this.c,r,o;Hl.subVectors(s,i),Vl.subVectors(a,i),Ig.subVectors(t,i);let l=Hl.dot(Ig),c=Vl.dot(Ig);if(l<=0&&c<=0)return n.copy(i);Pg.subVectors(t,s);let u=Hl.dot(Pg),d=Vl.dot(Pg);if(u>=0&&d<=u)return n.copy(s);let h=l*d-u*c;if(h<=0&&l>=0&&u<=0)return r=l/(l-u),n.copy(i).addScaledVector(Hl,r);zg.subVectors(t,a);let p=Hl.dot(zg),g=Vl.dot(zg);if(g>=0&&p<=g)return n.copy(a);let S=p*c-l*g;if(S<=0&&c>=0&&g<=0)return o=c/(c-g),n.copy(i).addScaledVector(Vl,o);let m=u*g-p*d;if(m<=0&&d-u>=0&&p-g>=0)return fE.subVectors(a,s),o=(d-u)/(d-u+(p-g)),n.copy(s).addScaledVector(fE,o);let f=1/(m+S+h);return r=S*f,o=h*f,n.copy(i).addScaledVector(Hl,r).addScaledVector(Vl,o)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}},rT={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},xr={h:0,s:0,l:0},Yf={h:0,s:0,l:0};fe=class{constructor(t,n,i){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,n,i)}set(t,n,i){if(n===void 0&&i===void 0){let s=t;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(t,n,i);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,n=Xs){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,ze.toWorkingColorSpace(this,n),this}setRGB(t,n,i,s=ze.workingColorSpace){return this.r=t,this.g=n,this.b=i,ze.toWorkingColorSpace(this,s),this}setHSL(t,n,i,s=ze.workingColorSpace){if(t=gy(t,1),n=ni(n,0,1),i=ni(i,0,1),n===0)this.r=this.g=this.b=i;else{let a=i<=.5?i*(1+n):i+n-i*n,r=2*i-a;this.r=Vg(r,a,t+1/3),this.g=Vg(r,a,t),this.b=Vg(r,a,t-1/3)}return ze.toWorkingColorSpace(this,s),this}setStyle(t,n=Xs){function i(a){a!==void 0&&parseFloat(a)<1&&console.warn("THREE.Color: Alpha component of "+t+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(t)){let a,r=s[1],o=s[2];switch(r){case"rgb":case"rgba":if(a=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return i(a[4]),this.setRGB(Math.min(255,parseInt(a[1],10))/255,Math.min(255,parseInt(a[2],10))/255,Math.min(255,parseInt(a[3],10))/255,n);if(a=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return i(a[4]),this.setRGB(Math.min(100,parseInt(a[1],10))/100,Math.min(100,parseInt(a[2],10))/100,Math.min(100,parseInt(a[3],10))/100,n);break;case"hsl":case"hsla":if(a=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return i(a[4]),this.setHSL(parseFloat(a[1])/360,parseFloat(a[2])/100,parseFloat(a[3])/100,n);break;default:console.warn("THREE.Color: Unknown color model "+t)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(t)){let a=s[1],r=a.length;if(r===3)return this.setRGB(parseInt(a.charAt(0),16)/15,parseInt(a.charAt(1),16)/15,parseInt(a.charAt(2),16)/15,n);if(r===6)return this.setHex(parseInt(a,16),n);console.warn("THREE.Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,n);return this}setColorName(t,n=Xs){let i=rT[t.toLowerCase()];return i!==void 0?this.setHex(i,n):console.warn("THREE.Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=jl(t.r),this.g=jl(t.g),this.b=jl(t.b),this}copyLinearToSRGB(t){return this.r=Tg(t.r),this.g=Tg(t.g),this.b=Tg(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=Xs){return ze.fromWorkingColorSpace(ei.copy(this),t),Math.round(ni(ei.r*255,0,255))*65536+Math.round(ni(ei.g*255,0,255))*256+Math.round(ni(ei.b*255,0,255))}getHexString(t=Xs){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,n=ze.workingColorSpace){ze.fromWorkingColorSpace(ei.copy(this),n);let i=ei.r,s=ei.g,a=ei.b,r=Math.max(i,s,a),o=Math.min(i,s,a),l,c,u=(o+r)/2;if(o===r)l=0,c=0;else{let d=r-o;switch(c=u<=.5?d/(r+o):d/(2-r-o),r){case i:l=(s-a)/d+(s<a?6:0);break;case s:l=(a-i)/d+2;break;case a:l=(i-s)/d+4;break}l/=6}return t.h=l,t.s=c,t.l=u,t}getRGB(t,n=ze.workingColorSpace){return ze.fromWorkingColorSpace(ei.copy(this),n),t.r=ei.r,t.g=ei.g,t.b=ei.b,t}getStyle(t=Xs){ze.fromWorkingColorSpace(ei.copy(this),t);let n=ei.r,i=ei.g,s=ei.b;return t!==Xs?`color(${t} ${n.toFixed(3)} ${i.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(n*255)},${Math.round(i*255)},${Math.round(s*255)})`}offsetHSL(t,n,i){return this.getHSL(xr),this.setHSL(xr.h+t,xr.s+n,xr.l+i)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,n){return this.r=t.r+n.r,this.g=t.g+n.g,this.b=t.b+n.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,n){return this.r+=(t.r-this.r)*n,this.g+=(t.g-this.g)*n,this.b+=(t.b-this.b)*n,this}lerpColors(t,n,i){return this.r=t.r+(n.r-t.r)*i,this.g=t.g+(n.g-t.g)*i,this.b=t.b+(n.b-t.b)*i,this}lerpHSL(t,n){this.getHSL(xr),t.getHSL(Yf);let i=Nu(xr.h,Yf.h,n),s=Nu(xr.s,Yf.s,n),a=Nu(xr.l,Yf.l,n);return this.setHSL(i,s,a),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){let n=this.r,i=this.g,s=this.b,a=t.elements;return this.r=a[0]*n+a[3]*i+a[6]*s,this.g=a[1]*n+a[4]*i+a[7]*s,this.b=a[2]*n+a[5]*i+a[8]*s,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,n=0){return this.r=t[n],this.g=t[n+1],this.b=t[n+2],this}toArray(t=[],n=0){return t[n]=this.r,t[n+1]=this.g,t[n+2]=this.b,t}fromBufferAttribute(t,n){return this.r=t.getX(n),this.g=t.getY(n),this.b=t.getZ(n),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},ei=new fe;fe.NAMES=rT;R3=0,po=class extends Ra{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:R3++}),this.uuid=oc(),this.name="",this.type="Material",this.blending=Ys,this.side=Zs,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=Qg,this.blendDst=Jg,this.blendEquation=ro,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new fe(0,0,0),this.blendAlpha=0,this.depthFunc=Ks,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=QM,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Ul,this.stencilZFail=Ul,this.stencilZPass=Ul,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(let n in t){let i=t[n];if(i===void 0){console.warn(`THREE.Material: parameter '${n}' has value of undefined.`);continue}let s=this[n];if(s===void 0){console.warn(`THREE.Material: '${n}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(i):s&&s.isVector3&&i&&i.isVector3?s.copy(i):this[n]=i}}toJSON(t){let n=t===void 0||typeof t=="string";n&&(t={textures:{},images:{}});let i={metadata:{version:4.6,type:"Material",generator:"Material.toJSON"}};i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.color&&this.color.isColor&&(i.color=this.color.getHex()),this.roughness!==void 0&&(i.roughness=this.roughness),this.metalness!==void 0&&(i.metalness=this.metalness),this.sheen!==void 0&&(i.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(i.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(i.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(i.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(i.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(i.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(i.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(i.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(i.shininess=this.shininess),this.clearcoat!==void 0&&(i.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(i.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(i.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(i.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(i.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,i.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.dispersion!==void 0&&(i.dispersion=this.dispersion),this.iridescence!==void 0&&(i.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(i.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(i.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(i.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(i.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(i.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(i.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(i.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(i.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(i.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(i.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(i.lightMap=this.lightMap.toJSON(t).uuid,i.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(i.aoMap=this.aoMap.toJSON(t).uuid,i.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(i.bumpMap=this.bumpMap.toJSON(t).uuid,i.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(i.normalMap=this.normalMap.toJSON(t).uuid,i.normalMapType=this.normalMapType,i.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(i.displacementMap=this.displacementMap.toJSON(t).uuid,i.displacementScale=this.displacementScale,i.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(i.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(i.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(i.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(i.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(i.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(i.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(i.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(i.combine=this.combine)),this.envMapRotation!==void 0&&(i.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(i.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(i.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(i.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(i.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(i.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(i.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(i.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(i.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(i.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(i.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(i.size=this.size),this.shadowSide!==null&&(i.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(i.sizeAttenuation=this.sizeAttenuation),this.blending!==Ys&&(i.blending=this.blending),this.side!==Zs&&(i.side=this.side),this.vertexColors===!0&&(i.vertexColors=!0),this.opacity<1&&(i.opacity=this.opacity),this.transparent===!0&&(i.transparent=!0),this.blendSrc!==Qg&&(i.blendSrc=this.blendSrc),this.blendDst!==Jg&&(i.blendDst=this.blendDst),this.blendEquation!==ro&&(i.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(i.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(i.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(i.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(i.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(i.blendAlpha=this.blendAlpha),this.depthFunc!==Ks&&(i.depthFunc=this.depthFunc),this.depthTest===!1&&(i.depthTest=this.depthTest),this.depthWrite===!1&&(i.depthWrite=this.depthWrite),this.colorWrite===!1&&(i.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(i.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==QM&&(i.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(i.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(i.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==Ul&&(i.stencilFail=this.stencilFail),this.stencilZFail!==Ul&&(i.stencilZFail=this.stencilZFail),this.stencilZPass!==Ul&&(i.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(i.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(i.rotation=this.rotation),this.polygonOffset===!0&&(i.polygonOffset=!0),this.polygonOffsetFactor!==0&&(i.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(i.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(i.linewidth=this.linewidth),this.dashSize!==void 0&&(i.dashSize=this.dashSize),this.gapSize!==void 0&&(i.gapSize=this.gapSize),this.scale!==void 0&&(i.scale=this.scale),this.dithering===!0&&(i.dithering=!0),this.alphaTest>0&&(i.alphaTest=this.alphaTest),this.alphaHash===!0&&(i.alphaHash=!0),this.alphaToCoverage===!0&&(i.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(i.premultipliedAlpha=!0),this.forceSinglePass===!0&&(i.forceSinglePass=!0),this.wireframe===!0&&(i.wireframe=!0),this.wireframeLinewidth>1&&(i.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(i.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(i.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(i.flatShading=!0),this.visible===!1&&(i.visible=!1),this.toneMapped===!1&&(i.toneMapped=!1),this.fog===!1&&(i.fog=!1),Object.keys(this.userData).length>0&&(i.userData=this.userData);function s(a){let r=[];for(let o in a){let l=a[o];delete l.metadata,r.push(l)}return r}if(n){let a=s(t.textures),r=s(t.images);a.length>0&&(i.textures=a),r.length>0&&(i.images=r)}return i}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;let n=t.clippingPlanes,i=null;if(n!==null){let s=n.length;i=new Array(s);for(let a=0;a!==s;++a)i[a]=n[a].clone()}return this.clippingPlanes=i,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}onBuild(){console.warn("Material: onBuild() has been removed.")}},Da=class extends po{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new fe(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Ca,this.combine=WE,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}},Mn=new W,Zf=new Yt,qe=class{constructor(t,n,i=!1){if(Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,this.name="",this.array=t,this.itemSize=n,this.count=t!==void 0?t.length/n:0,this.normalized=i,this.usage=JM,this.updateRanges=[],this.gpuType=Ta,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,n){this.updateRanges.push({start:t,count:n})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,n,i){t*=this.itemSize,i*=n.itemSize;for(let s=0,a=this.itemSize;s<a;s++)this.array[t+s]=n.array[i+s];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let n=0,i=this.count;n<i;n++)Zf.fromBufferAttribute(this,n),Zf.applyMatrix3(t),this.setXY(n,Zf.x,Zf.y);else if(this.itemSize===3)for(let n=0,i=this.count;n<i;n++)Mn.fromBufferAttribute(this,n),Mn.applyMatrix3(t),this.setXYZ(n,Mn.x,Mn.y,Mn.z);return this}applyMatrix4(t){for(let n=0,i=this.count;n<i;n++)Mn.fromBufferAttribute(this,n),Mn.applyMatrix4(t),this.setXYZ(n,Mn.x,Mn.y,Mn.z);return this}applyNormalMatrix(t){for(let n=0,i=this.count;n<i;n++)Mn.fromBufferAttribute(this,n),Mn.applyNormalMatrix(t),this.setXYZ(n,Mn.x,Mn.y,Mn.z);return this}transformDirection(t){for(let n=0,i=this.count;n<i;n++)Mn.fromBufferAttribute(this,n),Mn.transformDirection(t),this.setXYZ(n,Mn.x,Mn.y,Mn.z);return this}set(t,n=0){return this.array.set(t,n),this}getComponent(t,n){let i=this.array[t*this.itemSize+n];return this.normalized&&(i=ql(i,this.array)),i}setComponent(t,n,i){return this.normalized&&(i=di(i,this.array)),this.array[t*this.itemSize+n]=i,this}getX(t){let n=this.array[t*this.itemSize];return this.normalized&&(n=ql(n,this.array)),n}setX(t,n){return this.normalized&&(n=di(n,this.array)),this.array[t*this.itemSize]=n,this}getY(t){let n=this.array[t*this.itemSize+1];return this.normalized&&(n=ql(n,this.array)),n}setY(t,n){return this.normalized&&(n=di(n,this.array)),this.array[t*this.itemSize+1]=n,this}getZ(t){let n=this.array[t*this.itemSize+2];return this.normalized&&(n=ql(n,this.array)),n}setZ(t,n){return this.normalized&&(n=di(n,this.array)),this.array[t*this.itemSize+2]=n,this}getW(t){let n=this.array[t*this.itemSize+3];return this.normalized&&(n=ql(n,this.array)),n}setW(t,n){return this.normalized&&(n=di(n,this.array)),this.array[t*this.itemSize+3]=n,this}setXY(t,n,i){return t*=this.itemSize,this.normalized&&(n=di(n,this.array),i=di(i,this.array)),this.array[t+0]=n,this.array[t+1]=i,this}setXYZ(t,n,i,s){return t*=this.itemSize,this.normalized&&(n=di(n,this.array),i=di(i,this.array),s=di(s,this.array)),this.array[t+0]=n,this.array[t+1]=i,this.array[t+2]=s,this}setXYZW(t,n,i,s,a){return t*=this.itemSize,this.normalized&&(n=di(n,this.array),i=di(i,this.array),s=di(s,this.array),a=di(a,this.array)),this.array[t+0]=n,this.array[t+1]=i,this.array[t+2]=s,this.array[t+3]=a,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(t.name=this.name),this.usage!==JM&&(t.usage=this.usage),t}},Ed=class extends qe{constructor(t,n,i){super(new Uint16Array(t),n,i)}},Td=class extends qe{constructor(t,n,i){super(new Uint32Array(t),n,i)}},ai=class extends qe{constructor(t,n,i){super(new Float32Array(t),n,i)}},C3=0,ns=new pn,Gg=new ss,Gl=new W,Vi=new fo,Ru=new fo,Fn=new W,En=class e extends Ra{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:C3++}),this.uuid=oc(),this.name="",this.type="BufferGeometry",this.index=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(aT(t)?Td:Ed)(t,1):this.index=t,this}getAttribute(t){return this.attributes[t]}setAttribute(t,n){return this.attributes[t]=n,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,n,i=0){this.groups.push({start:t,count:n,materialIndex:i})}clearGroups(){this.groups=[]}setDrawRange(t,n){this.drawRange.start=t,this.drawRange.count=n}applyMatrix4(t){let n=this.attributes.position;n!==void 0&&(n.applyMatrix4(t),n.needsUpdate=!0);let i=this.attributes.normal;if(i!==void 0){let a=new ye().getNormalMatrix(t);i.applyNormalMatrix(a),i.needsUpdate=!0}let s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(t),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(t){return ns.makeRotationFromQuaternion(t),this.applyMatrix4(ns),this}rotateX(t){return ns.makeRotationX(t),this.applyMatrix4(ns),this}rotateY(t){return ns.makeRotationY(t),this.applyMatrix4(ns),this}rotateZ(t){return ns.makeRotationZ(t),this.applyMatrix4(ns),this}translate(t,n,i){return ns.makeTranslation(t,n,i),this.applyMatrix4(ns),this}scale(t,n,i){return ns.makeScale(t,n,i),this.applyMatrix4(ns),this}lookAt(t){return Gg.lookAt(t),Gg.updateMatrix(),this.applyMatrix4(Gg.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Gl).negate(),this.translate(Gl.x,Gl.y,Gl.z),this}setFromPoints(t){let n=[];for(let i=0,s=t.length;i<s;i++){let a=t[i];n.push(a.x,a.y,a.z||0)}return this.setAttribute("position",new ai(n,3)),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new fo);let t=this.attributes.position,n=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new W(-1/0,-1/0,-1/0),new W(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),n)for(let i=0,s=n.length;i<s;i++){let a=n[i];Vi.setFromBufferAttribute(a),this.morphTargetsRelative?(Fn.addVectors(this.boundingBox.min,Vi.min),this.boundingBox.expandByPoint(Fn),Fn.addVectors(this.boundingBox.max,Vi.max),this.boundingBox.expandByPoint(Fn)):(this.boundingBox.expandByPoint(Vi.min),this.boundingBox.expandByPoint(Vi.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new nc);let t=this.attributes.position,n=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new W,1/0);return}if(t){let i=this.boundingSphere.center;if(Vi.setFromBufferAttribute(t),n)for(let a=0,r=n.length;a<r;a++){let o=n[a];Ru.setFromBufferAttribute(o),this.morphTargetsRelative?(Fn.addVectors(Vi.min,Ru.min),Vi.expandByPoint(Fn),Fn.addVectors(Vi.max,Ru.max),Vi.expandByPoint(Fn)):(Vi.expandByPoint(Ru.min),Vi.expandByPoint(Ru.max))}Vi.getCenter(i);let s=0;for(let a=0,r=t.count;a<r;a++)Fn.fromBufferAttribute(t,a),s=Math.max(s,i.distanceToSquared(Fn));if(n)for(let a=0,r=n.length;a<r;a++){let o=n[a],l=this.morphTargetsRelative;for(let c=0,u=o.count;c<u;c++)Fn.fromBufferAttribute(o,c),l&&(Gl.fromBufferAttribute(t,c),Fn.add(Gl)),s=Math.max(s,i.distanceToSquared(Fn))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let t=this.index,n=this.attributes;if(t===null||n.position===void 0||n.normal===void 0||n.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let i=n.position,s=n.normal,a=n.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new qe(new Float32Array(4*i.count),4));let r=this.getAttribute("tangent"),o=[],l=[];for(let N=0;N<i.count;N++)o[N]=new W,l[N]=new W;let c=new W,u=new W,d=new W,h=new Yt,p=new Yt,g=new Yt,S=new W,m=new W;function f(N,et,v){c.fromBufferAttribute(i,N),u.fromBufferAttribute(i,et),d.fromBufferAttribute(i,v),h.fromBufferAttribute(a,N),p.fromBufferAttribute(a,et),g.fromBufferAttribute(a,v),u.sub(c),d.sub(c),p.sub(h),g.sub(h);let M=1/(p.x*g.y-g.x*p.y);isFinite(M)&&(S.copy(u).multiplyScalar(g.y).addScaledVector(d,-p.y).multiplyScalar(M),m.copy(d).multiplyScalar(p.x).addScaledVector(u,-g.x).multiplyScalar(M),o[N].add(S),o[et].add(S),o[v].add(S),l[N].add(m),l[et].add(m),l[v].add(m))}let y=this.groups;y.length===0&&(y=[{start:0,count:t.count}]);for(let N=0,et=y.length;N<et;++N){let v=y[N],M=v.start,F=v.count;for(let q=M,K=M+F;q<K;q+=3)f(t.getX(q+0),t.getX(q+1),t.getX(q+2))}let _=new W,b=new W,D=new W,R=new W;function A(N){D.fromBufferAttribute(s,N),R.copy(D);let et=o[N];_.copy(et),_.sub(D.multiplyScalar(D.dot(et))).normalize(),b.crossVectors(R,et);let M=b.dot(l[N])<0?-1:1;r.setXYZW(N,_.x,_.y,_.z,M)}for(let N=0,et=y.length;N<et;++N){let v=y[N],M=v.start,F=v.count;for(let q=M,K=M+F;q<K;q+=3)A(t.getX(q+0)),A(t.getX(q+1)),A(t.getX(q+2))}}computeVertexNormals(){let t=this.index,n=this.getAttribute("position");if(n!==void 0){let i=this.getAttribute("normal");if(i===void 0)i=new qe(new Float32Array(n.count*3),3),this.setAttribute("normal",i);else for(let h=0,p=i.count;h<p;h++)i.setXYZ(h,0,0,0);let s=new W,a=new W,r=new W,o=new W,l=new W,c=new W,u=new W,d=new W;if(t)for(let h=0,p=t.count;h<p;h+=3){let g=t.getX(h+0),S=t.getX(h+1),m=t.getX(h+2);s.fromBufferAttribute(n,g),a.fromBufferAttribute(n,S),r.fromBufferAttribute(n,m),u.subVectors(r,a),d.subVectors(s,a),u.cross(d),o.fromBufferAttribute(i,g),l.fromBufferAttribute(i,S),c.fromBufferAttribute(i,m),o.add(u),l.add(u),c.add(u),i.setXYZ(g,o.x,o.y,o.z),i.setXYZ(S,l.x,l.y,l.z),i.setXYZ(m,c.x,c.y,c.z)}else for(let h=0,p=n.count;h<p;h+=3)s.fromBufferAttribute(n,h+0),a.fromBufferAttribute(n,h+1),r.fromBufferAttribute(n,h+2),u.subVectors(r,a),d.subVectors(s,a),u.cross(d),i.setXYZ(h+0,u.x,u.y,u.z),i.setXYZ(h+1,u.x,u.y,u.z),i.setXYZ(h+2,u.x,u.y,u.z);this.normalizeNormals(),i.needsUpdate=!0}}normalizeNormals(){let t=this.attributes.normal;for(let n=0,i=t.count;n<i;n++)Fn.fromBufferAttribute(t,n),Fn.normalize(),t.setXYZ(n,Fn.x,Fn.y,Fn.z)}toNonIndexed(){function t(o,l){let c=o.array,u=o.itemSize,d=o.normalized,h=new c.constructor(l.length*u),p=0,g=0;for(let S=0,m=l.length;S<m;S++){o.isInterleavedBufferAttribute?p=l[S]*o.data.stride+o.offset:p=l[S]*u;for(let f=0;f<u;f++)h[g++]=c[p++]}return new qe(h,u,d)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let n=new e,i=this.index.array,s=this.attributes;for(let o in s){let l=s[o],c=t(l,i);n.setAttribute(o,c)}let a=this.morphAttributes;for(let o in a){let l=[],c=a[o];for(let u=0,d=c.length;u<d;u++){let h=c[u],p=t(h,i);l.push(p)}n.morphAttributes[o]=l}n.morphTargetsRelative=this.morphTargetsRelative;let r=this.groups;for(let o=0,l=r.length;o<l;o++){let c=r[o];n.addGroup(c.start,c.count,c.materialIndex)}return n}toJSON(){let t={metadata:{version:4.6,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.type,this.name!==""&&(t.name=this.name),Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(t[c]=l[c]);return t}t.data={attributes:{}};let n=this.index;n!==null&&(t.data.index={type:n.array.constructor.name,array:Array.prototype.slice.call(n.array)});let i=this.attributes;for(let l in i){let c=i[l];t.data.attributes[l]=c.toJSON(t.data)}let s={},a=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],u=[];for(let d=0,h=c.length;d<h;d++){let p=c[d];u.push(p.toJSON(t.data))}u.length>0&&(s[l]=u,a=!0)}a&&(t.data.morphAttributes=s,t.data.morphTargetsRelative=this.morphTargetsRelative);let r=this.groups;r.length>0&&(t.data.groups=JSON.parse(JSON.stringify(r)));let o=this.boundingSphere;return o!==null&&(t.data.boundingSphere={center:o.center.toArray(),radius:o.radius}),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let n={};this.name=t.name;let i=t.index;i!==null&&this.setIndex(i.clone(n));let s=t.attributes;for(let c in s){let u=s[c];this.setAttribute(c,u.clone(n))}let a=t.morphAttributes;for(let c in a){let u=[],d=a[c];for(let h=0,p=d.length;h<p;h++)u.push(d[h].clone(n));this.morphAttributes[c]=u}this.morphTargetsRelative=t.morphTargetsRelative;let r=t.groups;for(let c=0,u=r.length;c<u;c++){let d=r[c];this.addGroup(d.start,d.count,d.materialIndex)}let o=t.boundingBox;o!==null&&(this.boundingBox=o.clone());let l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}},dE=new pn,eo=new ic,Kf=new nc,pE=new W,jf=new W,Qf=new W,Jf=new W,kg=new W,$f=new W,mE=new W,td=new W,si=class extends ss{constructor(t=new En,n=new Da){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=n,this.updateMorphTargets()}copy(t,n){return super.copy(t,n),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){let n=this.geometry.morphAttributes,i=Object.keys(n);if(i.length>0){let s=n[i[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let a=0,r=s.length;a<r;a++){let o=s[a].name||String(a);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=a}}}}getVertexPosition(t,n){let i=this.geometry,s=i.attributes.position,a=i.morphAttributes.position,r=i.morphTargetsRelative;n.fromBufferAttribute(s,t);let o=this.morphTargetInfluences;if(a&&o){$f.set(0,0,0);for(let l=0,c=a.length;l<c;l++){let u=o[l],d=a[l];u!==0&&(kg.fromBufferAttribute(d,t),r?$f.addScaledVector(kg,u):$f.addScaledVector(kg.sub(n),u))}n.add($f)}return n}raycast(t,n){let i=this.geometry,s=this.material,a=this.matrixWorld;s!==void 0&&(i.boundingSphere===null&&i.computeBoundingSphere(),Kf.copy(i.boundingSphere),Kf.applyMatrix4(a),eo.copy(t.ray).recast(t.near),!(Kf.containsPoint(eo.origin)===!1&&(eo.intersectSphere(Kf,pE)===null||eo.origin.distanceToSquared(pE)>(t.far-t.near)**2))&&(dE.copy(a).invert(),eo.copy(t.ray).applyMatrix4(dE),!(i.boundingBox!==null&&eo.intersectsBox(i.boundingBox)===!1)&&this._computeIntersections(t,n,eo)))}_computeIntersections(t,n,i){let s,a=this.geometry,r=this.material,o=a.index,l=a.attributes.position,c=a.attributes.uv,u=a.attributes.uv1,d=a.attributes.normal,h=a.groups,p=a.drawRange;if(o!==null)if(Array.isArray(r))for(let g=0,S=h.length;g<S;g++){let m=h[g],f=r[m.materialIndex],y=Math.max(m.start,p.start),_=Math.min(o.count,Math.min(m.start+m.count,p.start+p.count));for(let b=y,D=_;b<D;b+=3){let R=o.getX(b),A=o.getX(b+1),N=o.getX(b+2);s=ed(this,f,t,i,c,u,d,R,A,N),s&&(s.faceIndex=Math.floor(b/3),s.face.materialIndex=m.materialIndex,n.push(s))}}else{let g=Math.max(0,p.start),S=Math.min(o.count,p.start+p.count);for(let m=g,f=S;m<f;m+=3){let y=o.getX(m),_=o.getX(m+1),b=o.getX(m+2);s=ed(this,r,t,i,c,u,d,y,_,b),s&&(s.faceIndex=Math.floor(m/3),n.push(s))}}else if(l!==void 0)if(Array.isArray(r))for(let g=0,S=h.length;g<S;g++){let m=h[g],f=r[m.materialIndex],y=Math.max(m.start,p.start),_=Math.min(l.count,Math.min(m.start+m.count,p.start+p.count));for(let b=y,D=_;b<D;b+=3){let R=b,A=b+1,N=b+2;s=ed(this,f,t,i,c,u,d,R,A,N),s&&(s.faceIndex=Math.floor(b/3),s.face.materialIndex=m.materialIndex,n.push(s))}}else{let g=Math.max(0,p.start),S=Math.min(l.count,p.start+p.count);for(let m=g,f=S;m<f;m+=3){let y=m,_=m+1,b=m+2;s=ed(this,r,t,i,c,u,d,y,_,b),s&&(s.faceIndex=Math.floor(m/3),n.push(s))}}}};Iu=class e extends En{constructor(t=1,n=1,i=1,s=1,a=1,r=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:n,depth:i,widthSegments:s,heightSegments:a,depthSegments:r};let o=this;s=Math.floor(s),a=Math.floor(a),r=Math.floor(r);let l=[],c=[],u=[],d=[],h=0,p=0;g("z","y","x",-1,-1,i,n,t,r,a,0),g("z","y","x",1,-1,i,n,-t,r,a,1),g("x","z","y",1,1,t,i,n,s,r,2),g("x","z","y",1,-1,t,i,-n,s,r,3),g("x","y","z",1,-1,t,n,i,s,a,4),g("x","y","z",-1,-1,t,n,-i,s,a,5),this.setIndex(l),this.setAttribute("position",new ai(c,3)),this.setAttribute("normal",new ai(u,3)),this.setAttribute("uv",new ai(d,2));function g(S,m,f,y,_,b,D,R,A,N,et){let v=b/A,M=D/N,F=b/2,q=D/2,K=R/2,$=A+1,B=N+1,ct=0,Z=0,wt=new W;for(let mt=0;mt<B;mt++){let ft=mt*M-q;for(let Ht=0;Ht<$;Ht++){let ie=Ht*v-F;wt[S]=ie*y,wt[m]=ft*_,wt[f]=K,c.push(wt.x,wt.y,wt.z),wt[S]=0,wt[m]=0,wt[f]=R>0?1:-1,u.push(wt.x,wt.y,wt.z),d.push(Ht/A),d.push(1-mt/N),ct+=1}}for(let mt=0;mt<N;mt++)for(let ft=0;ft<A;ft++){let Ht=h+ft+$*mt,ie=h+ft+$*(mt+1),nt=h+(ft+1)+$*(mt+1),rt=h+(ft+1)+$*mt;l.push(Ht,ie,rt),l.push(ie,nt,rt),Z+=6}o.addGroup(p,Z,et),p+=Z,h+=ct}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}};lc={clone:sc,merge:pi},U3=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,L3=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,un=class extends po{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=U3,this.fragmentShader=L3,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=sc(t.uniforms),this.uniformsGroups=N3(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this}toJSON(t){let n=super.toJSON(t);n.glslVersion=this.glslVersion,n.uniforms={};for(let s in this.uniforms){let r=this.uniforms[s].value;r&&r.isTexture?n.uniforms[s]={type:"t",value:r.toJSON(t).uuid}:r&&r.isColor?n.uniforms[s]={type:"c",value:r.getHex()}:r&&r.isVector2?n.uniforms[s]={type:"v2",value:r.toArray()}:r&&r.isVector3?n.uniforms[s]={type:"v3",value:r.toArray()}:r&&r.isVector4?n.uniforms[s]={type:"v4",value:r.toArray()}:r&&r.isMatrix3?n.uniforms[s]={type:"m3",value:r.toArray()}:r&&r.isMatrix4?n.uniforms[s]={type:"m4",value:r.toArray()}:n.uniforms[s]={value:r}}Object.keys(this.defines).length>0&&(n.defines=this.defines),n.vertexShader=this.vertexShader,n.fragmentShader=this.fragmentShader,n.lights=this.lights,n.clipping=this.clipping;let i={};for(let s in this.extensions)this.extensions[s]===!0&&(i[s]=!0);return Object.keys(i).length>0&&(n.extensions=i),n}},Ad=class extends ss{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new pn,this.projectionMatrix=new pn,this.projectionMatrixInverse=new pn,this.coordinateSystem=Aa}copy(t,n){return super.copy(t,n),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(t,n){super.updateWorldMatrix(t,n),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}},br=new W,gE=new Yt,vE=new Yt,mi=class extends Ad{constructor(t=50,n=1,i=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=i,this.far=s,this.focus=10,this.aspect=n,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,n){return super.copy(t,n),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){let n=.5*this.getFilmHeight()/t;this.fov=Ou*2*Math.atan(n),this.updateProjectionMatrix()}getFocalLength(){let t=Math.tan(Du*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return Ou*2*Math.atan(Math.tan(Du*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,n,i){br.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(br.x,br.y).multiplyScalar(-t/br.z),br.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),i.set(br.x,br.y).multiplyScalar(-t/br.z)}getViewSize(t,n){return this.getViewBounds(t,gE,vE),n.subVectors(vE,gE)}setViewOffset(t,n,i,s,a,r){this.aspect=t/n,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=n,this.view.offsetX=i,this.view.offsetY=s,this.view.width=a,this.view.height=r,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=this.near,n=t*Math.tan(Du*.5*this.fov)/this.zoom,i=2*n,s=this.aspect*i,a=-.5*s,r=this.view;if(this.view!==null&&this.view.enabled){let l=r.fullWidth,c=r.fullHeight;a+=r.offsetX*s/l,n-=r.offsetY*i/c,s*=r.width/l,i*=r.height/c}let o=this.filmOffset;o!==0&&(a+=t*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(a,a+s,n,n-i,t,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let n=super.toJSON(t);return n.object.fov=this.fov,n.object.zoom=this.zoom,n.object.near=this.near,n.object.far=this.far,n.object.focus=this.focus,n.object.aspect=this.aspect,this.view!==null&&(n.object.view=Object.assign({},this.view)),n.object.filmGauge=this.filmGauge,n.object.filmOffset=this.filmOffset,n}},kl=-90,Xl=1,Fv=class extends ss{constructor(t,n,i){super(),this.type="CubeCamera",this.renderTarget=i,this.coordinateSystem=null,this.activeMipmapLevel=0;let s=new mi(kl,Xl,t,n);s.layers=this.layers,this.add(s);let a=new mi(kl,Xl,t,n);a.layers=this.layers,this.add(a);let r=new mi(kl,Xl,t,n);r.layers=this.layers,this.add(r);let o=new mi(kl,Xl,t,n);o.layers=this.layers,this.add(o);let l=new mi(kl,Xl,t,n);l.layers=this.layers,this.add(l);let c=new mi(kl,Xl,t,n);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let t=this.coordinateSystem,n=this.children.concat(),[i,s,a,r,o,l]=n;for(let c of n)this.remove(c);if(t===Aa)i.up.set(0,1,0),i.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),a.up.set(0,0,-1),a.lookAt(0,1,0),r.up.set(0,0,1),r.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(t===_d)i.up.set(0,-1,0),i.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),a.up.set(0,0,1),a.lookAt(0,1,0),r.up.set(0,0,-1),r.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(let c of n)this.add(c),c.updateMatrixWorld()}update(t,n){this.parent===null&&this.updateMatrixWorld();let{renderTarget:i,activeMipmapLevel:s}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());let[a,r,o,l,c,u]=this.children,d=t.getRenderTarget(),h=t.getActiveCubeFace(),p=t.getActiveMipmapLevel(),g=t.xr.enabled;t.xr.enabled=!1;let S=i.texture.generateMipmaps;i.texture.generateMipmaps=!1,t.setRenderTarget(i,0,s),t.render(n,a),t.setRenderTarget(i,1,s),t.render(n,r),t.setRenderTarget(i,2,s),t.render(n,o),t.setRenderTarget(i,3,s),t.render(n,l),t.setRenderTarget(i,4,s),t.render(n,c),i.texture.generateMipmaps=S,t.setRenderTarget(i,5,s),t.render(n,u),t.setRenderTarget(d,h,p),t.xr.enabled=g,i.texture.needsPMREMUpdate=!0}},wd=class extends Gi{constructor(t,n,i,s,a,r,o,l,c,u){t=t!==void 0?t:[],n=n!==void 0?n:Jl,super(t,n,i,s,a,r,o,l,c,u),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}},Hv=class extends Zn{constructor(t=1,n={}){super(t,t,n),this.isWebGLCubeRenderTarget=!0;let i={width:t,height:t,depth:1},s=[i,i,i,i,i,i];this.texture=new wd(s,n.mapping,n.wrapS,n.wrapT,n.magFilter,n.minFilter,n.format,n.type,n.anisotropy,n.colorSpace),this.texture.isRenderTargetTexture=!0,this.texture.generateMipmaps=n.generateMipmaps!==void 0?n.generateMipmaps:!1,this.texture.minFilter=n.minFilter!==void 0?n.minFilter:_s}fromEquirectangularTexture(t,n){this.texture.type=n.type,this.texture.colorSpace=n.colorSpace,this.texture.generateMipmaps=n.generateMipmaps,this.texture.minFilter=n.minFilter,this.texture.magFilter=n.magFilter;let i={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},s=new Iu(5,5,5),a=new un({name:"CubemapFromEquirect",uniforms:sc(i.uniforms),vertexShader:i.vertexShader,fragmentShader:i.fragmentShader,side:Ti,blending:qs});a.uniforms.tEquirect.value=n;let r=new si(s,a),o=n.minFilter;return n.minFilter===uo&&(n.minFilter=_s),new Fv(1,10,this).update(t,r),n.minFilter=o,r.geometry.dispose(),r.material.dispose(),this}clear(t,n,i,s){let a=t.getRenderTarget();for(let r=0;r<6;r++)t.setRenderTarget(this,r),t.clear(n,i,s);t.setRenderTarget(a)}},Xg=new W,O3=new W,I3=new ye,ys=class{constructor(t=new W(1,0,0),n=0){this.isPlane=!0,this.normal=t,this.constant=n}set(t,n){return this.normal.copy(t),this.constant=n,this}setComponents(t,n,i,s){return this.normal.set(t,n,i),this.constant=s,this}setFromNormalAndCoplanarPoint(t,n){return this.normal.copy(t),this.constant=-n.dot(this.normal),this}setFromCoplanarPoints(t,n,i){let s=Xg.subVectors(i,n).cross(O3.subVectors(t,n)).normalize();return this.setFromNormalAndCoplanarPoint(s,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){let t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,n){return n.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,n){let i=t.delta(Xg),s=this.normal.dot(i);if(s===0)return this.distanceToPoint(t.start)===0?n.copy(t.start):null;let a=-(t.start.dot(this.normal)+this.constant)/s;return a<0||a>1?null:n.copy(t.start).addScaledVector(i,a)}intersectsLine(t){let n=this.distanceToPoint(t.start),i=this.distanceToPoint(t.end);return n<0&&i>0||i<0&&n>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,n){let i=n||I3.getNormalMatrix(t),s=this.coplanarPoint(Xg).applyMatrix4(t),a=this.normal.applyMatrix3(i).normalize();return this.constant=-s.dot(a),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}},no=new nc,nd=new W,Rd=class{constructor(t=new ys,n=new ys,i=new ys,s=new ys,a=new ys,r=new ys){this.planes=[t,n,i,s,a,r]}set(t,n,i,s,a,r){let o=this.planes;return o[0].copy(t),o[1].copy(n),o[2].copy(i),o[3].copy(s),o[4].copy(a),o[5].copy(r),this}copy(t){let n=this.planes;for(let i=0;i<6;i++)n[i].copy(t.planes[i]);return this}setFromProjectionMatrix(t,n=Aa){let i=this.planes,s=t.elements,a=s[0],r=s[1],o=s[2],l=s[3],c=s[4],u=s[5],d=s[6],h=s[7],p=s[8],g=s[9],S=s[10],m=s[11],f=s[12],y=s[13],_=s[14],b=s[15];if(i[0].setComponents(l-a,h-c,m-p,b-f).normalize(),i[1].setComponents(l+a,h+c,m+p,b+f).normalize(),i[2].setComponents(l+r,h+u,m+g,b+y).normalize(),i[3].setComponents(l-r,h-u,m-g,b-y).normalize(),i[4].setComponents(l-o,h-d,m-S,b-_).normalize(),n===Aa)i[5].setComponents(l+o,h+d,m+S,b+_).normalize();else if(n===_d)i[5].setComponents(o,d,S,_).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+n);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),no.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{let n=t.geometry;n.boundingSphere===null&&n.computeBoundingSphere(),no.copy(n.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(no)}intersectsSprite(t){return no.center.set(0,0,0),no.radius=.7071067811865476,no.applyMatrix4(t.matrixWorld),this.intersectsSphere(no)}intersectsSphere(t){let n=this.planes,i=t.center,s=-t.radius;for(let a=0;a<6;a++)if(n[a].distanceToPoint(i)<s)return!1;return!0}intersectsBox(t){let n=this.planes;for(let i=0;i<6;i++){let s=n[i];if(nd.x=s.normal.x>0?t.max.x:t.min.x,nd.y=s.normal.y>0?t.max.y:t.min.y,nd.z=s.normal.z>0?t.max.z:t.min.z,s.distanceToPoint(nd)<0)return!1}return!0}containsPoint(t){let n=this.planes;for(let i=0;i<6;i++)if(n[i].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};Cd=class e extends En{constructor(t=1,n=1,i=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:n,widthSegments:i,heightSegments:s};let a=t/2,r=n/2,o=Math.floor(i),l=Math.floor(s),c=o+1,u=l+1,d=t/o,h=n/l,p=[],g=[],S=[],m=[];for(let f=0;f<u;f++){let y=f*h-r;for(let _=0;_<c;_++){let b=_*d-a;g.push(b,-y,0),S.push(0,0,1),m.push(_/o),m.push(1-f/l)}}for(let f=0;f<l;f++)for(let y=0;y<o;y++){let _=y+c*f,b=y+c*(f+1),D=y+1+c*(f+1),R=y+1+c*f;p.push(_,b,R),p.push(b,D,R)}this.setIndex(p),this.setAttribute("position",new ai(g,3)),this.setAttribute("normal",new ai(S,3)),this.setAttribute("uv",new ai(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.widthSegments,t.heightSegments)}},z3=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,B3=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,F3=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,H3=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,V3=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,G3=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,k3=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,X3=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,W3=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,q3=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Y3=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,Z3=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,K3=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,j3=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,Q3=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,J3=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,$3=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,tD=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,eD=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,nD=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,iD=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,sD=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,aD=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,rD=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,oD=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,lD=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,cD=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,uD=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,hD=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,fD=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,dD="gl_FragColor = linearToOutputTexel( gl_FragColor );",pD=`
const mat3 LINEAR_SRGB_TO_LINEAR_DISPLAY_P3 = mat3(
	vec3( 0.8224621, 0.177538, 0.0 ),
	vec3( 0.0331941, 0.9668058, 0.0 ),
	vec3( 0.0170827, 0.0723974, 0.9105199 )
);
const mat3 LINEAR_DISPLAY_P3_TO_LINEAR_SRGB = mat3(
	vec3( 1.2249401, - 0.2249404, 0.0 ),
	vec3( - 0.0420569, 1.0420571, 0.0 ),
	vec3( - 0.0196376, - 0.0786361, 1.0982735 )
);
vec4 LinearSRGBToLinearDisplayP3( in vec4 value ) {
	return vec4( value.rgb * LINEAR_SRGB_TO_LINEAR_DISPLAY_P3, value.a );
}
vec4 LinearDisplayP3ToLinearSRGB( in vec4 value ) {
	return vec4( value.rgb * LINEAR_DISPLAY_P3_TO_LINEAR_SRGB, value.a );
}
vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,mD=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,gD=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,vD=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,yD=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,_D=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,xD=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,bD=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,SD=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,MD=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,ED=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,TD=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,AD=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,wD=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,RD=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,CD=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,DD=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,ND=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,UD=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,LD=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,OD=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,ID=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,PD=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,zD=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,BD=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,FD=`#if defined( USE_LOGDEPTHBUF )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,HD=`#if defined( USE_LOGDEPTHBUF )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,VD=`#ifdef USE_LOGDEPTHBUF
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,GD=`#ifdef USE_LOGDEPTHBUF
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,kD=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
	
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,XD=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,WD=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,qD=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,YD=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,ZD=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,KD=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,jD=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,QD=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,JD=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,$D=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,tN=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,eN=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,nN=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,iN=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,sN=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,aN=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,rN=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,oN=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,lN=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,cN=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,uN=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,hN=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,fN=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,dN=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,pN=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,mN=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,gN=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,vN=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,yN=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		float hard_shadow = step( compare , distribution.x );
		if (hard_shadow != 1.0 ) {
			float distance = compare - distribution.x ;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,_N=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,xN=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,bN=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,SN=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,MN=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,EN=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,TN=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,AN=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,wN=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,RN=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,CN=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,DN=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,NN=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
		
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
		
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		
		#else
		
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,UN=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,LN=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,ON=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,IN=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,PN=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,zN=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,BN=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,FN=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,HN=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,VN=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,GN=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,kN=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,XN=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,WN=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,qN=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,YN=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,ZN=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,KN=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,jN=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,QN=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,JN=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,$N=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,tU=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,eU=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,nU=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,iU=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,sU=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,aU=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,rU=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,oU=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,lU=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,cU=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,uU=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,hU=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,fU=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,dU=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,pU=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,mU=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,ve={alphahash_fragment:z3,alphahash_pars_fragment:B3,alphamap_fragment:F3,alphamap_pars_fragment:H3,alphatest_fragment:V3,alphatest_pars_fragment:G3,aomap_fragment:k3,aomap_pars_fragment:X3,batching_pars_vertex:W3,batching_vertex:q3,begin_vertex:Y3,beginnormal_vertex:Z3,bsdfs:K3,iridescence_fragment:j3,bumpmap_pars_fragment:Q3,clipping_planes_fragment:J3,clipping_planes_pars_fragment:$3,clipping_planes_pars_vertex:tD,clipping_planes_vertex:eD,color_fragment:nD,color_pars_fragment:iD,color_pars_vertex:sD,color_vertex:aD,common:rD,cube_uv_reflection_fragment:oD,defaultnormal_vertex:lD,displacementmap_pars_vertex:cD,displacementmap_vertex:uD,emissivemap_fragment:hD,emissivemap_pars_fragment:fD,colorspace_fragment:dD,colorspace_pars_fragment:pD,envmap_fragment:mD,envmap_common_pars_fragment:gD,envmap_pars_fragment:vD,envmap_pars_vertex:yD,envmap_physical_pars_fragment:CD,envmap_vertex:_D,fog_vertex:xD,fog_pars_vertex:bD,fog_fragment:SD,fog_pars_fragment:MD,gradientmap_pars_fragment:ED,lightmap_pars_fragment:TD,lights_lambert_fragment:AD,lights_lambert_pars_fragment:wD,lights_pars_begin:RD,lights_toon_fragment:DD,lights_toon_pars_fragment:ND,lights_phong_fragment:UD,lights_phong_pars_fragment:LD,lights_physical_fragment:OD,lights_physical_pars_fragment:ID,lights_fragment_begin:PD,lights_fragment_maps:zD,lights_fragment_end:BD,logdepthbuf_fragment:FD,logdepthbuf_pars_fragment:HD,logdepthbuf_pars_vertex:VD,logdepthbuf_vertex:GD,map_fragment:kD,map_pars_fragment:XD,map_particle_fragment:WD,map_particle_pars_fragment:qD,metalnessmap_fragment:YD,metalnessmap_pars_fragment:ZD,morphinstance_vertex:KD,morphcolor_vertex:jD,morphnormal_vertex:QD,morphtarget_pars_vertex:JD,morphtarget_vertex:$D,normal_fragment_begin:tN,normal_fragment_maps:eN,normal_pars_fragment:nN,normal_pars_vertex:iN,normal_vertex:sN,normalmap_pars_fragment:aN,clearcoat_normal_fragment_begin:rN,clearcoat_normal_fragment_maps:oN,clearcoat_pars_fragment:lN,iridescence_pars_fragment:cN,opaque_fragment:uN,packing:hN,premultiplied_alpha_fragment:fN,project_vertex:dN,dithering_fragment:pN,dithering_pars_fragment:mN,roughnessmap_fragment:gN,roughnessmap_pars_fragment:vN,shadowmap_pars_fragment:yN,shadowmap_pars_vertex:_N,shadowmap_vertex:xN,shadowmask_pars_fragment:bN,skinbase_vertex:SN,skinning_pars_vertex:MN,skinning_vertex:EN,skinnormal_vertex:TN,specularmap_fragment:AN,specularmap_pars_fragment:wN,tonemapping_fragment:RN,tonemapping_pars_fragment:CN,transmission_fragment:DN,transmission_pars_fragment:NN,uv_pars_fragment:UN,uv_pars_vertex:LN,uv_vertex:ON,worldpos_vertex:IN,background_vert:PN,background_frag:zN,backgroundCube_vert:BN,backgroundCube_frag:FN,cube_vert:HN,cube_frag:VN,depth_vert:GN,depth_frag:kN,distanceRGBA_vert:XN,distanceRGBA_frag:WN,equirect_vert:qN,equirect_frag:YN,linedashed_vert:ZN,linedashed_frag:KN,meshbasic_vert:jN,meshbasic_frag:QN,meshlambert_vert:JN,meshlambert_frag:$N,meshmatcap_vert:tU,meshmatcap_frag:eU,meshnormal_vert:nU,meshnormal_frag:iU,meshphong_vert:sU,meshphong_frag:aU,meshphysical_vert:rU,meshphysical_frag:oU,meshtoon_vert:lU,meshtoon_frag:cU,points_vert:uU,points_frag:hU,shadow_vert:fU,shadow_frag:dU,sprite_vert:pU,sprite_frag:mU},Lt={common:{diffuse:{value:new fe(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new ye},alphaMap:{value:null},alphaMapTransform:{value:new ye},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new ye}},envmap:{envMap:{value:null},envMapRotation:{value:new ye},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new ye}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new ye}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new ye},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new ye},normalScale:{value:new Yt(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new ye},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new ye}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new ye}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new ye}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new fe(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new fe(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new ye},alphaTest:{value:0},uvTransform:{value:new ye}},sprite:{diffuse:{value:new fe(16777215)},opacity:{value:1},center:{value:new Yt(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new ye},alphaMap:{value:null},alphaMapTransform:{value:new ye},alphaTest:{value:0}}},Ws={basic:{uniforms:pi([Lt.common,Lt.specularmap,Lt.envmap,Lt.aomap,Lt.lightmap,Lt.fog]),vertexShader:ve.meshbasic_vert,fragmentShader:ve.meshbasic_frag},lambert:{uniforms:pi([Lt.common,Lt.specularmap,Lt.envmap,Lt.aomap,Lt.lightmap,Lt.emissivemap,Lt.bumpmap,Lt.normalmap,Lt.displacementmap,Lt.fog,Lt.lights,{emissive:{value:new fe(0)}}]),vertexShader:ve.meshlambert_vert,fragmentShader:ve.meshlambert_frag},phong:{uniforms:pi([Lt.common,Lt.specularmap,Lt.envmap,Lt.aomap,Lt.lightmap,Lt.emissivemap,Lt.bumpmap,Lt.normalmap,Lt.displacementmap,Lt.fog,Lt.lights,{emissive:{value:new fe(0)},specular:{value:new fe(1118481)},shininess:{value:30}}]),vertexShader:ve.meshphong_vert,fragmentShader:ve.meshphong_frag},standard:{uniforms:pi([Lt.common,Lt.envmap,Lt.aomap,Lt.lightmap,Lt.emissivemap,Lt.bumpmap,Lt.normalmap,Lt.displacementmap,Lt.roughnessmap,Lt.metalnessmap,Lt.fog,Lt.lights,{emissive:{value:new fe(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:ve.meshphysical_vert,fragmentShader:ve.meshphysical_frag},toon:{uniforms:pi([Lt.common,Lt.aomap,Lt.lightmap,Lt.emissivemap,Lt.bumpmap,Lt.normalmap,Lt.displacementmap,Lt.gradientmap,Lt.fog,Lt.lights,{emissive:{value:new fe(0)}}]),vertexShader:ve.meshtoon_vert,fragmentShader:ve.meshtoon_frag},matcap:{uniforms:pi([Lt.common,Lt.bumpmap,Lt.normalmap,Lt.displacementmap,Lt.fog,{matcap:{value:null}}]),vertexShader:ve.meshmatcap_vert,fragmentShader:ve.meshmatcap_frag},points:{uniforms:pi([Lt.points,Lt.fog]),vertexShader:ve.points_vert,fragmentShader:ve.points_frag},dashed:{uniforms:pi([Lt.common,Lt.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:ve.linedashed_vert,fragmentShader:ve.linedashed_frag},depth:{uniforms:pi([Lt.common,Lt.displacementmap]),vertexShader:ve.depth_vert,fragmentShader:ve.depth_frag},normal:{uniforms:pi([Lt.common,Lt.bumpmap,Lt.normalmap,Lt.displacementmap,{opacity:{value:1}}]),vertexShader:ve.meshnormal_vert,fragmentShader:ve.meshnormal_frag},sprite:{uniforms:pi([Lt.sprite,Lt.fog]),vertexShader:ve.sprite_vert,fragmentShader:ve.sprite_frag},background:{uniforms:{uvTransform:{value:new ye},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:ve.background_vert,fragmentShader:ve.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new ye}},vertexShader:ve.backgroundCube_vert,fragmentShader:ve.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:ve.cube_vert,fragmentShader:ve.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:ve.equirect_vert,fragmentShader:ve.equirect_frag},distanceRGBA:{uniforms:pi([Lt.common,Lt.displacementmap,{referencePosition:{value:new W},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:ve.distanceRGBA_vert,fragmentShader:ve.distanceRGBA_frag},shadow:{uniforms:pi([Lt.lights,Lt.fog,{color:{value:new fe(0)},opacity:{value:1}}]),vertexShader:ve.shadow_vert,fragmentShader:ve.shadow_frag}};Ws.physical={uniforms:pi([Ws.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new ye},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new ye},clearcoatNormalScale:{value:new Yt(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new ye},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new ye},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new ye},sheen:{value:0},sheenColor:{value:new fe(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new ye},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new ye},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new ye},transmissionSamplerSize:{value:new Yt},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new ye},attenuationDistance:{value:0},attenuationColor:{value:new fe(0)},specularColor:{value:new fe(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new ye},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new ye},anisotropyVector:{value:new Yt},anisotropyMap:{value:null},anisotropyMapTransform:{value:new ye}}]),vertexShader:ve.meshphysical_vert,fragmentShader:ve.meshphysical_frag};id={r:0,b:0,g:0},io=new Ca,gU=new pn;Pu=class extends Ad{constructor(t=-1,n=1,i=1,s=-1,a=.1,r=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=n,this.top=i,this.bottom=s,this.near=a,this.far=r,this.updateProjectionMatrix()}copy(t,n){return super.copy(t,n),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,n,i,s,a,r){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=n,this.view.offsetX=i,this.view.offsetY=s,this.view.width=a,this.view.height=r,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=(this.right-this.left)/(2*this.zoom),n=(this.top-this.bottom)/(2*this.zoom),i=(this.right+this.left)/2,s=(this.top+this.bottom)/2,a=i-t,r=i+t,o=s+n,l=s-n;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,u=(this.top-this.bottom)/this.view.fullHeight/this.zoom;a+=c*this.view.offsetX,r=a+c*this.view.width,o-=u*this.view.offsetY,l=o-u*this.view.height}this.projectionMatrix.makeOrthographic(a,r,o,l,this.near,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let n=super.toJSON(t);return n.object.zoom=this.zoom,n.object.left=this.left,n.object.right=this.right,n.object.top=this.top,n.object.bottom=this.bottom,n.object.near=this.near,n.object.far=this.far,this.view!==null&&(n.object.view=Object.assign({},this.view)),n}},Yl=4,yE=[.125,.215,.35,.446,.526,.582],lo=20,Wg=new Pu,_E=new fe,qg=null,Yg=0,Zg=0,Kg=!1,ao=(1+Math.sqrt(5))/2,Wl=1/ao,xE=[new W(-ao,Wl,0),new W(ao,Wl,0),new W(-Wl,0,ao),new W(Wl,0,ao),new W(0,ao,-Wl),new W(0,ao,Wl),new W(-1,1,-1),new W(1,1,-1),new W(-1,1,1),new W(1,1,1)],Dd=class{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(t,n=0,i=.1,s=100){qg=this._renderer.getRenderTarget(),Yg=this._renderer.getActiveCubeFace(),Zg=this._renderer.getActiveMipmapLevel(),Kg=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(256);let a=this._allocateTargets();return a.depthBuffer=!0,this._sceneToCubeUV(t,i,s,a),n>0&&this._blur(a,0,0,n),this._applyPMREM(a),this._cleanup(a),a}fromEquirectangular(t,n=null){return this._fromTexture(t,n)}fromCubemap(t,n=null){return this._fromTexture(t,n)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=ME(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=SE(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodPlanes.length;t++)this._lodPlanes[t].dispose()}_cleanup(t){this._renderer.setRenderTarget(qg,Yg,Zg),this._renderer.xr.enabled=Kg,t.scissorTest=!1,sd(t,0,0,t.width,t.height)}_fromTexture(t,n){t.mapping===Jl||t.mapping===$l?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),qg=this._renderer.getRenderTarget(),Yg=this._renderer.getActiveCubeFace(),Zg=this._renderer.getActiveMipmapLevel(),Kg=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let i=n||this._allocateTargets();return this._textureToCubeUV(t,i),this._applyPMREM(i),this._cleanup(i),i}_allocateTargets(){let t=3*Math.max(this._cubeSize,112),n=4*this._cubeSize,i={magFilter:_s,minFilter:_s,generateMipmaps:!1,type:Es,format:xs,colorSpace:js,depthBuffer:!1},s=bE(t,n,i);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==n){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=bE(t,n,i);let{_lodMax:a}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=MU(a)),this._blurMaterial=EU(a,t,n)}return s}_compileMaterial(t){let n=new si(this._lodPlanes[0],t);this._renderer.compile(n,Wg)}_sceneToCubeUV(t,n,i,s){let o=new mi(90,1,n,i),l=[1,-1,1,1,1,1],c=[1,1,1,-1,-1,-1],u=this._renderer,d=u.autoClear,h=u.toneMapping;u.getClearColor(_E),u.toneMapping=Mr,u.autoClear=!1;let p=new Da({name:"PMREM.Background",side:Ti,depthWrite:!1,depthTest:!1}),g=new si(new Iu,p),S=!1,m=t.background;m?m.isColor&&(p.color.copy(m),t.background=null,S=!0):(p.color.copy(_E),S=!0);for(let f=0;f<6;f++){let y=f%3;y===0?(o.up.set(0,l[f],0),o.lookAt(c[f],0,0)):y===1?(o.up.set(0,0,l[f]),o.lookAt(0,c[f],0)):(o.up.set(0,l[f],0),o.lookAt(0,0,c[f]));let _=this._cubeSize;sd(s,y*_,f>2?_:0,_,_),u.setRenderTarget(s),S&&u.render(g,o),u.render(t,o)}g.geometry.dispose(),g.material.dispose(),u.toneMapping=h,u.autoClear=d,t.background=m}_textureToCubeUV(t,n){let i=this._renderer,s=t.mapping===Jl||t.mapping===$l;s?(this._cubemapMaterial===null&&(this._cubemapMaterial=ME()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=SE());let a=s?this._cubemapMaterial:this._equirectMaterial,r=new si(this._lodPlanes[0],a),o=a.uniforms;o.envMap.value=t;let l=this._cubeSize;sd(n,0,0,3*l,2*l),i.setRenderTarget(n),i.render(r,Wg)}_applyPMREM(t){let n=this._renderer,i=n.autoClear;n.autoClear=!1;let s=this._lodPlanes.length;for(let a=1;a<s;a++){let r=Math.sqrt(this._sigmas[a]*this._sigmas[a]-this._sigmas[a-1]*this._sigmas[a-1]),o=xE[(s-a-1)%xE.length];this._blur(t,a-1,a,r,o)}n.autoClear=i}_blur(t,n,i,s,a){let r=this._pingPongRenderTarget;this._halfBlur(t,r,n,i,s,"latitudinal",a),this._halfBlur(r,t,i,i,s,"longitudinal",a)}_halfBlur(t,n,i,s,a,r,o){let l=this._renderer,c=this._blurMaterial;r!=="latitudinal"&&r!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");let u=3,d=new si(this._lodPlanes[s],c),h=c.uniforms,p=this._sizeLods[i]-1,g=isFinite(a)?Math.PI/(2*p):2*Math.PI/(2*lo-1),S=a/g,m=isFinite(a)?1+Math.floor(u*S):lo;m>lo&&console.warn(`sigmaRadians, ${a}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${lo}`);let f=[],y=0;for(let A=0;A<lo;++A){let N=A/S,et=Math.exp(-N*N/2);f.push(et),A===0?y+=et:A<m&&(y+=2*et)}for(let A=0;A<f.length;A++)f[A]=f[A]/y;h.envMap.value=t.texture,h.samples.value=m,h.weights.value=f,h.latitudinal.value=r==="latitudinal",o&&(h.poleAxis.value=o);let{_lodMax:_}=this;h.dTheta.value=g,h.mipInt.value=_-i;let b=this._sizeLods[s],D=3*b*(s>_-Yl?s-_+Yl:0),R=4*(this._cubeSize-b);sd(n,D,R,3*b,2*b),l.setRenderTarget(n),l.render(d,Wg)}};Nd=class extends Gi{constructor(t,n,i,s,a,r,o,l,c,u=Kl){if(u!==Kl&&u!==ec)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");i===void 0&&u===Kl&&(i=ho),i===void 0&&u===ec&&(i=tc),super(null,s,a,r,o,l,u,i,c),this.isDepthTexture=!0,this.image={width:t,height:n},this.magFilter=o!==void 0?o:is,this.minFilter=l!==void 0?l:is,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.compareFunction=t.compareFunction,this}toJSON(t){let n=super.toJSON(t);return this.compareFunction!==null&&(n.compareFunction=this.compareFunction),n}},cT=new Gi,EE=new Nd(1,1),uT=new Sd,hT=new Bv,fT=new wd,TE=[],AE=[],wE=new Float32Array(16),RE=new Float32Array(9),CE=new Float32Array(4);Vv=class{constructor(t,n,i){this.id=t,this.addr=i,this.cache=[],this.type=n.type,this.setValue=QU(n.type)}},Gv=class{constructor(t,n,i){this.id=t,this.addr=i,this.cache=[],this.type=n.type,this.size=n.size,this.setValue=vL(n.type)}},kv=class{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,n,i){let s=this.seq;for(let a=0,r=s.length;a!==r;++a){let o=s[a];o.setValue(t,n[o.id],i)}}},jg=/(\w+)(\])?(\[|\.)?/g;Ql=class{constructor(t,n){this.seq=[],this.map={};let i=t.getProgramParameter(n,t.ACTIVE_UNIFORMS);for(let s=0;s<i;++s){let a=t.getActiveUniform(n,s),r=t.getUniformLocation(n,a.name);yL(a,r,this)}}setValue(t,n,i,s){let a=this.map[n];a!==void 0&&a.setValue(t,i,s)}setOptional(t,n,i){let s=n[i];s!==void 0&&this.setValue(t,i,s)}static upload(t,n,i,s){for(let a=0,r=n.length;a!==r;++a){let o=n[a],l=i[o.id];l.needsUpdate!==!1&&o.setValue(t,l.value,s)}}static seqWithValue(t,n){let i=[];for(let s=0,a=t.length;s!==a;++s){let r=t[s];r.id in n&&i.push(r)}return i}};_L=37297,xL=0;ad=new W;CL=/^[ \t]*#include +<([\w\d./]+)>/gm;DL=new Map;UL=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;HL=0,Wv=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t){let n=t.vertexShader,i=t.fragmentShader,s=this._getShaderStage(n),a=this._getShaderStage(i),r=this._getShaderCacheForMaterial(t);return r.has(s)===!1&&(r.add(s),s.usedTimes++),r.has(a)===!1&&(r.add(a),a.usedTimes++),this}remove(t){let n=this.materialCache.get(t);for(let i of n)i.usedTimes--,i.usedTimes===0&&this.shaderCache.delete(i.code);return this.materialCache.delete(t),this}getVertexShaderID(t){return this._getShaderStage(t.vertexShader).id}getFragmentShaderID(t){return this._getShaderStage(t.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){let n=this.materialCache,i=n.get(t);return i===void 0&&(i=new Set,n.set(t,i)),i}_getShaderStage(t){let n=this.shaderCache,i=n.get(t);return i===void 0&&(i=new qv(t),n.set(t,i)),i}},qv=class{constructor(t){this.id=HL++,this.code=t,this.usedTimes=0}};YL=0;Yv=class extends po{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=VC,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}},Zv=class extends po{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}},QL=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,JL=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;tO={[$g]:tv,[ev]:Er,[nv]:sv,[Ks]:iv,[tv]:$g,[Er]:ev,[sv]:nv,[iv]:Ks};Kv=class extends mi{constructor(t=[]){super(),this.isArrayCamera=!0,this.cameras=t}},Zl=class extends ss{constructor(){super(),this.isGroup=!0,this.type="Group"}},aO={type:"move"},Uu=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Zl,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Zl,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new W,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new W),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Zl,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new W,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new W),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){let n=this._hand;if(n)for(let i of t.hand.values())this._getHandJoint(n,i)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,n,i){let s=null,a=null,r=null,o=this._targetRay,l=this._grip,c=this._hand;if(t&&n.session.visibilityState!=="visible-blurred"){if(c&&t.hand){r=!0;for(let S of t.hand.values()){let m=n.getJointPose(S,i),f=this._getHandJoint(c,S);m!==null&&(f.matrix.fromArray(m.transform.matrix),f.matrix.decompose(f.position,f.rotation,f.scale),f.matrixWorldNeedsUpdate=!0,f.jointRadius=m.radius),f.visible=m!==null}let u=c.joints["index-finger-tip"],d=c.joints["thumb-tip"],h=u.position.distanceTo(d.position),p=.02,g=.005;c.inputState.pinching&&h>p+g?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!c.inputState.pinching&&h<=p-g&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else l!==null&&t.gripSpace&&(a=n.getPose(t.gripSpace,i),a!==null&&(l.matrix.fromArray(a.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,a.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(a.linearVelocity)):l.hasLinearVelocity=!1,a.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(a.angularVelocity)):l.hasAngularVelocity=!1));o!==null&&(s=n.getPose(t.targetRaySpace,i),s===null&&a!==null&&(s=a),s!==null&&(o.matrix.fromArray(s.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,s.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(s.linearVelocity)):o.hasLinearVelocity=!1,s.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(s.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(aO)))}return o!==null&&(o.visible=s!==null),l!==null&&(l.visible=a!==null),c!==null&&(c.visible=r!==null),this}_getHandJoint(t,n){if(t.joints[n.jointName]===void 0){let i=new Zl;i.matrixAutoUpdate=!1,i.visible=!1,t.joints[n.jointName]=i,t.add(i)}return t.joints[n.jointName]}},rO=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,oO=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,jv=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,n,i){if(this.texture===null){let s=new Gi,a=t.properties.get(s);a.__webglTexture=n.texture,(n.depthNear!=i.depthNear||n.depthFar!=i.depthFar)&&(this.depthNear=n.depthNear,this.depthFar=n.depthFar),this.texture=s}}getMesh(t){if(this.texture!==null&&this.mesh===null){let n=t.cameras[0].viewport,i=new un({vertexShader:rO,fragmentShader:oO,uniforms:{depthColor:{value:this.texture},depthWidth:{value:n.z},depthHeight:{value:n.w}}});this.mesh=new si(new Cd(20,20),i)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},Qv=class extends Ra{constructor(t,n){super();let i=this,s=null,a=1,r=null,o="local-floor",l=1,c=null,u=null,d=null,h=null,p=null,g=null,S=new jv,m=n.getContextAttributes(),f=null,y=null,_=[],b=[],D=new Yt,R=null,A=new mi;A.layers.enable(1),A.viewport=new ke;let N=new mi;N.layers.enable(2),N.viewport=new ke;let et=[A,N],v=new Kv;v.layers.enable(1),v.layers.enable(2);let M=null,F=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(nt){let rt=_[nt];return rt===void 0&&(rt=new Uu,_[nt]=rt),rt.getTargetRaySpace()},this.getControllerGrip=function(nt){let rt=_[nt];return rt===void 0&&(rt=new Uu,_[nt]=rt),rt.getGripSpace()},this.getHand=function(nt){let rt=_[nt];return rt===void 0&&(rt=new Uu,_[nt]=rt),rt.getHandSpace()};function q(nt){let rt=b.indexOf(nt.inputSource);if(rt===-1)return;let Rt=_[rt];Rt!==void 0&&(Rt.update(nt.inputSource,nt.frame,c||r),Rt.dispatchEvent({type:nt.type,data:nt.inputSource}))}function K(){s.removeEventListener("select",q),s.removeEventListener("selectstart",q),s.removeEventListener("selectend",q),s.removeEventListener("squeeze",q),s.removeEventListener("squeezestart",q),s.removeEventListener("squeezeend",q),s.removeEventListener("end",K),s.removeEventListener("inputsourceschange",$);for(let nt=0;nt<_.length;nt++){let rt=b[nt];rt!==null&&(b[nt]=null,_[nt].disconnect(rt))}M=null,F=null,S.reset(),t.setRenderTarget(f),p=null,h=null,d=null,s=null,y=null,ie.stop(),i.isPresenting=!1,t.setPixelRatio(R),t.setSize(D.width,D.height,!1),i.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(nt){a=nt,i.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(nt){o=nt,i.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||r},this.setReferenceSpace=function(nt){c=nt},this.getBaseLayer=function(){return h!==null?h:p},this.getBinding=function(){return d},this.getFrame=function(){return g},this.getSession=function(){return s},this.setSession=async function(nt){if(s=nt,s!==null){if(f=t.getRenderTarget(),s.addEventListener("select",q),s.addEventListener("selectstart",q),s.addEventListener("selectend",q),s.addEventListener("squeeze",q),s.addEventListener("squeezestart",q),s.addEventListener("squeezeend",q),s.addEventListener("end",K),s.addEventListener("inputsourceschange",$),m.xrCompatible!==!0&&await n.makeXRCompatible(),R=t.getPixelRatio(),t.getSize(D),s.renderState.layers===void 0){let rt={antialias:m.antialias,alpha:!0,depth:m.depth,stencil:m.stencil,framebufferScaleFactor:a};p=new XRWebGLLayer(s,n,rt),s.updateRenderState({baseLayer:p}),t.setPixelRatio(1),t.setSize(p.framebufferWidth,p.framebufferHeight,!1),y=new Zn(p.framebufferWidth,p.framebufferHeight,{format:xs,type:bs,colorSpace:t.outputColorSpace,stencilBuffer:m.stencil})}else{let rt=null,Rt=null,St=null;m.depth&&(St=m.stencil?n.DEPTH24_STENCIL8:n.DEPTH_COMPONENT24,rt=m.stencil?ec:Kl,Rt=m.stencil?tc:ho);let Kt={colorFormat:n.RGBA8,depthFormat:St,scaleFactor:a};d=new XRWebGLBinding(s,n),h=d.createProjectionLayer(Kt),s.updateRenderState({layers:[h]}),t.setPixelRatio(1),t.setSize(h.textureWidth,h.textureHeight,!1),y=new Zn(h.textureWidth,h.textureHeight,{format:xs,type:bs,depthTexture:new Nd(h.textureWidth,h.textureHeight,Rt,void 0,void 0,void 0,void 0,void 0,void 0,rt),stencilBuffer:m.stencil,colorSpace:t.outputColorSpace,samples:m.antialias?4:0,resolveDepthBuffer:h.ignoreDepthValues===!1})}y.isXRRenderTarget=!0,this.setFoveation(l),c=null,r=await s.requestReferenceSpace(o),ie.setContext(s),ie.start(),i.isPresenting=!0,i.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return S.getDepthTexture()};function $(nt){for(let rt=0;rt<nt.removed.length;rt++){let Rt=nt.removed[rt],St=b.indexOf(Rt);St>=0&&(b[St]=null,_[St].disconnect(Rt))}for(let rt=0;rt<nt.added.length;rt++){let Rt=nt.added[rt],St=b.indexOf(Rt);if(St===-1){for(let Nt=0;Nt<_.length;Nt++)if(Nt>=b.length){b.push(Rt),St=Nt;break}else if(b[Nt]===null){b[Nt]=Rt,St=Nt;break}if(St===-1)break}let Kt=_[St];Kt&&Kt.connect(Rt)}}let B=new W,ct=new W;function Z(nt,rt,Rt){B.setFromMatrixPosition(rt.matrixWorld),ct.setFromMatrixPosition(Rt.matrixWorld);let St=B.distanceTo(ct),Kt=rt.projectionMatrix.elements,Nt=Rt.projectionMatrix.elements,Vt=Kt[14]/(Kt[10]-1),me=Kt[14]/(Kt[10]+1),te=(Kt[9]+1)/Kt[5],C=(Kt[9]-1)/Kt[5],sn=(Kt[8]-1)/Kt[0],ee=(Nt[8]+1)/Nt[0],ce=Vt*sn,j=Vt*ee,ut=St/(-sn+ee),ot=ut*-sn;if(rt.matrixWorld.decompose(nt.position,nt.quaternion,nt.scale),nt.translateX(ot),nt.translateZ(ut),nt.matrixWorld.compose(nt.position,nt.quaternion,nt.scale),nt.matrixWorldInverse.copy(nt.matrixWorld).invert(),Kt[10]===-1)nt.projectionMatrix.copy(rt.projectionMatrix),nt.projectionMatrixInverse.copy(rt.projectionMatrixInverse);else{let E=Vt+ut,x=me+ut,P=ce-ot,Q=j+(St-ot),tt=te*me/x*E,J=C*me/x*E;nt.projectionMatrix.makePerspective(P,Q,tt,J,E,x),nt.projectionMatrixInverse.copy(nt.projectionMatrix).invert()}}function wt(nt,rt){rt===null?nt.matrixWorld.copy(nt.matrix):nt.matrixWorld.multiplyMatrices(rt.matrixWorld,nt.matrix),nt.matrixWorldInverse.copy(nt.matrixWorld).invert()}this.updateCamera=function(nt){if(s===null)return;let rt=nt.near,Rt=nt.far;S.texture!==null&&(S.depthNear>0&&(rt=S.depthNear),S.depthFar>0&&(Rt=S.depthFar)),v.near=N.near=A.near=rt,v.far=N.far=A.far=Rt,(M!==v.near||F!==v.far)&&(s.updateRenderState({depthNear:v.near,depthFar:v.far}),M=v.near,F=v.far);let St=nt.parent,Kt=v.cameras;wt(v,St);for(let Nt=0;Nt<Kt.length;Nt++)wt(Kt[Nt],St);Kt.length===2?Z(v,A,N):v.projectionMatrix.copy(A.projectionMatrix),mt(nt,v,St)};function mt(nt,rt,Rt){Rt===null?nt.matrix.copy(rt.matrixWorld):(nt.matrix.copy(Rt.matrixWorld),nt.matrix.invert(),nt.matrix.multiply(rt.matrixWorld)),nt.matrix.decompose(nt.position,nt.quaternion,nt.scale),nt.updateMatrixWorld(!0),nt.projectionMatrix.copy(rt.projectionMatrix),nt.projectionMatrixInverse.copy(rt.projectionMatrixInverse),nt.isPerspectiveCamera&&(nt.fov=Ou*2*Math.atan(1/nt.projectionMatrix.elements[5]),nt.zoom=1)}this.getCamera=function(){return v},this.getFoveation=function(){if(!(h===null&&p===null))return l},this.setFoveation=function(nt){l=nt,h!==null&&(h.fixedFoveation=nt),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=nt)},this.hasDepthSensing=function(){return S.texture!==null},this.getDepthSensingMesh=function(){return S.getMesh(v)};let ft=null;function Ht(nt,rt){if(u=rt.getViewerPose(c||r),g=rt,u!==null){let Rt=u.views;p!==null&&(t.setRenderTargetFramebuffer(y,p.framebuffer),t.setRenderTarget(y));let St=!1;Rt.length!==v.cameras.length&&(v.cameras.length=0,St=!0);for(let Nt=0;Nt<Rt.length;Nt++){let Vt=Rt[Nt],me=null;if(p!==null)me=p.getViewport(Vt);else{let C=d.getViewSubImage(h,Vt);me=C.viewport,Nt===0&&(t.setRenderTargetTextures(y,C.colorTexture,h.ignoreDepthValues?void 0:C.depthStencilTexture),t.setRenderTarget(y))}let te=et[Nt];te===void 0&&(te=new mi,te.layers.enable(Nt),te.viewport=new ke,et[Nt]=te),te.matrix.fromArray(Vt.transform.matrix),te.matrix.decompose(te.position,te.quaternion,te.scale),te.projectionMatrix.fromArray(Vt.projectionMatrix),te.projectionMatrixInverse.copy(te.projectionMatrix).invert(),te.viewport.set(me.x,me.y,me.width,me.height),Nt===0&&(v.matrix.copy(te.matrix),v.matrix.decompose(v.position,v.quaternion,v.scale)),St===!0&&v.cameras.push(te)}let Kt=s.enabledFeatures;if(Kt&&Kt.includes("depth-sensing")){let Nt=d.getDepthInformation(Rt[0]);Nt&&Nt.isValid&&Nt.texture&&S.init(t,Nt,s.renderState)}}for(let Rt=0;Rt<_.length;Rt++){let St=b[Rt],Kt=_[Rt];St!==null&&Kt!==void 0&&Kt.update(St,rt,c||r)}ft&&ft(nt,rt),rt.detectedPlanes&&i.dispatchEvent({type:"planesdetected",data:rt}),g=null}let ie=new lT;ie.setAnimationLoop(Ht),this.setAnimationLoop=function(nt){ft=nt},this.dispose=function(){}}},so=new Ca,lO=new pn;Ud=class{constructor(t={}){let{canvas:n=p3(),context:i=null,depth:s=!0,stencil:a=!1,alpha:r=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:u="default",failIfMajorPerformanceCaveat:d=!1}=t;this.isWebGLRenderer=!0;let h;if(i!==null){if(typeof WebGLRenderingContext<"u"&&i instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");h=i.getContextAttributes().alpha}else h=r;let p=new Uint32Array(4),g=new Int32Array(4),S=null,m=null,f=[],y=[];this.domElement=n,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this._outputColorSpace=Xs,this.toneMapping=Mr,this.toneMappingExposure=1;let _=this,b=!1,D=0,R=0,A=null,N=-1,et=null,v=new ke,M=new ke,F=null,q=new fe(0),K=0,$=n.width,B=n.height,ct=1,Z=null,wt=null,mt=new ke(0,0,$,B),ft=new ke(0,0,$,B),Ht=!1,ie=new Rd,nt=!1,rt=!1,Rt=new pn,St=new pn,Kt=new W,Nt=new ke,Vt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},me=!1;function te(){return A===null?ct:1}let C=i;function sn(T,I){return n.getContext(T,I)}try{let T={alpha:!0,depth:s,stencil:a,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:u,failIfMajorPerformanceCaveat:d};if("setAttribute"in n&&n.setAttribute("data-engine","three.js r169"),n.addEventListener("webglcontextlost",G,!1),n.addEventListener("webglcontextrestored",it,!1),n.addEventListener("webglcontextcreationerror",lt,!1),C===null){let I="webgl2";if(C=sn(I,T),C===null)throw sn(I)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(T){throw console.error("THREE.WebGLRenderer: "+T.message),T}let ee,ce,j,ut,ot,E,x,P,Q,tt,J,Ot,Mt,Et,_e,vt,Bt,bt,$t,zt,de,O,k,w;function V(){ee=new AU(C),ee.init(),O=new sO(C,ee),ce=new xU(C,ee,t,O),j=new eO(C),ce.reverseDepthBuffer&&j.buffers.depth.setReversed(!0),ut=new CU(C),ot=new GL,E=new iO(C,ee,j,ot,ce,O,ut),x=new SU(_),P=new TU(_),Q=new P3(C),k=new yU(C,Q),tt=new wU(C,Q,ut,k),J=new NU(C,tt,Q,ut),$t=new DU(C,ce,E),vt=new bU(ot),Ot=new VL(_,x,P,ee,ce,k,vt),Mt=new cO(_,ot),Et=new XL,_e=new jL(ee),bt=new vU(_,x,P,j,J,h,l),Bt=new $L(_,J,ce),w=new uO(C,ut,ce,j),zt=new _U(C,ee,ut),de=new RU(C,ee,ut),ut.programs=Ot.programs,_.capabilities=ce,_.extensions=ee,_.properties=ot,_.renderLists=Et,_.shadowMap=Bt,_.state=j,_.info=ut}V();let L=new Qv(_,C);this.xr=L,this.getContext=function(){return C},this.getContextAttributes=function(){return C.getContextAttributes()},this.forceContextLoss=function(){let T=ee.get("WEBGL_lose_context");T&&T.loseContext()},this.forceContextRestore=function(){let T=ee.get("WEBGL_lose_context");T&&T.restoreContext()},this.getPixelRatio=function(){return ct},this.setPixelRatio=function(T){T!==void 0&&(ct=T,this.setSize($,B,!1))},this.getSize=function(T){return T.set($,B)},this.setSize=function(T,I,H=!0){if(L.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}$=T,B=I,n.width=Math.floor(T*ct),n.height=Math.floor(I*ct),H===!0&&(n.style.width=T+"px",n.style.height=I+"px"),this.setViewport(0,0,T,I)},this.getDrawingBufferSize=function(T){return T.set($*ct,B*ct).floor()},this.setDrawingBufferSize=function(T,I,H){$=T,B=I,ct=H,n.width=Math.floor(T*H),n.height=Math.floor(I*H),this.setViewport(0,0,T,I)},this.getCurrentViewport=function(T){return T.copy(v)},this.getViewport=function(T){return T.copy(mt)},this.setViewport=function(T,I,H,X){T.isVector4?mt.set(T.x,T.y,T.z,T.w):mt.set(T,I,H,X),j.viewport(v.copy(mt).multiplyScalar(ct).round())},this.getScissor=function(T){return T.copy(ft)},this.setScissor=function(T,I,H,X){T.isVector4?ft.set(T.x,T.y,T.z,T.w):ft.set(T,I,H,X),j.scissor(M.copy(ft).multiplyScalar(ct).round())},this.getScissorTest=function(){return Ht},this.setScissorTest=function(T){j.setScissorTest(Ht=T)},this.setOpaqueSort=function(T){Z=T},this.setTransparentSort=function(T){wt=T},this.getClearColor=function(T){return T.copy(bt.getClearColor())},this.setClearColor=function(){bt.setClearColor.apply(bt,arguments)},this.getClearAlpha=function(){return bt.getClearAlpha()},this.setClearAlpha=function(){bt.setClearAlpha.apply(bt,arguments)},this.clear=function(T=!0,I=!0,H=!0){let X=0;if(T){let z=!1;if(A!==null){let pt=A.texture.format;z=pt===py||pt===dy||pt===fy}if(z){let pt=A.texture.type,Ct=pt===bs||pt===ho||pt===Lu||pt===tc||pt===uy||pt===hy,Pt=bt.getClearColor(),At=bt.getClearAlpha(),Qt=Pt.r,qt=Pt.g,kt=Pt.b;Ct?(p[0]=Qt,p[1]=qt,p[2]=kt,p[3]=At,C.clearBufferuiv(C.COLOR,0,p)):(g[0]=Qt,g[1]=qt,g[2]=kt,g[3]=At,C.clearBufferiv(C.COLOR,0,g))}else X|=C.COLOR_BUFFER_BIT}I&&(X|=C.DEPTH_BUFFER_BIT,C.clearDepth(this.capabilities.reverseDepthBuffer?0:1)),H&&(X|=C.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),C.clear(X)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){n.removeEventListener("webglcontextlost",G,!1),n.removeEventListener("webglcontextrestored",it,!1),n.removeEventListener("webglcontextcreationerror",lt,!1),Et.dispose(),_e.dispose(),ot.dispose(),x.dispose(),P.dispose(),J.dispose(),k.dispose(),w.dispose(),Ot.dispose(),L.dispose(),L.removeEventListener("sessionstart",Oe),L.removeEventListener("sessionend",Ie),ln.stop()};function G(T){T.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),b=!0}function it(){console.log("THREE.WebGLRenderer: Context Restored."),b=!1;let T=ut.autoReset,I=Bt.enabled,H=Bt.autoUpdate,X=Bt.needsUpdate,z=Bt.type;V(),ut.autoReset=T,Bt.enabled=I,Bt.autoUpdate=H,Bt.needsUpdate=X,Bt.type=z}function lt(T){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",T.statusMessage)}function Tt(T){let I=T.target;I.removeEventListener("dispose",Tt),jt(I)}function jt(T){Xt(T),ot.remove(T)}function Xt(T){let I=ot.get(T).programs;I!==void 0&&(I.forEach(function(H){Ot.releaseProgram(H)}),T.isShaderMaterial&&Ot.releaseShaderCache(T))}this.renderBufferDirect=function(T,I,H,X,z,pt){I===null&&(I=Vt);let Ct=z.isMesh&&z.matrixWorld.determinant()<0,Pt=ri(T,I,H,X,z);j.setMaterial(X,Ct);let At=H.index,Qt=1;if(X.wireframe===!0){if(At=tt.getWireframeAttribute(H),At===void 0)return;Qt=2}let qt=H.drawRange,kt=H.attributes.position,De=qt.start*Qt,Be=(qt.start+qt.count)*Qt;pt!==null&&(De=Math.max(De,pt.start*Qt),Be=Math.min(Be,(pt.start+pt.count)*Qt)),At!==null?(De=Math.max(De,0),Be=Math.min(Be,At.count)):kt!=null&&(De=Math.max(De,0),Be=Math.min(Be,kt.count));let Fe=Be-De;if(Fe<0||Fe===1/0)return;k.setup(z,X,Pt,H,At);let en,ae=zt;if(At!==null&&(en=Q.get(At),ae=de,ae.setIndex(en)),z.isMesh)X.wireframe===!0?(j.setLineWidth(X.wireframeLinewidth*te()),ae.setMode(C.LINES)):ae.setMode(C.TRIANGLES);else if(z.isLine){let Gt=X.linewidth;Gt===void 0&&(Gt=1),j.setLineWidth(Gt*te()),z.isLineSegments?ae.setMode(C.LINES):z.isLineLoop?ae.setMode(C.LINE_LOOP):ae.setMode(C.LINE_STRIP)}else z.isPoints?ae.setMode(C.POINTS):z.isSprite&&ae.setMode(C.TRIANGLES);if(z.isBatchedMesh)if(z._multiDrawInstances!==null)ae.renderMultiDrawInstances(z._multiDrawStarts,z._multiDrawCounts,z._multiDrawCount,z._multiDrawInstances);else if(ee.get("WEBGL_multi_draw"))ae.renderMultiDraw(z._multiDrawStarts,z._multiDrawCounts,z._multiDrawCount);else{let Gt=z._multiDrawStarts,Xe=z._multiDrawCounts,Ae=z._multiDrawCount,Hn=At?Q.get(At).bytesPerElement:1,ge=ot.get(X).currentProgram.getUniforms();for(let Un=0;Un<Ae;Un++)ge.setValue(C,"_gl_DrawID",Un),ae.render(Gt[Un]/Hn,Xe[Un])}else if(z.isInstancedMesh)ae.renderInstances(De,Fe,z.count);else if(H.isInstancedBufferGeometry){let Gt=H._maxInstanceCount!==void 0?H._maxInstanceCount:1/0,Xe=Math.min(H.instanceCount,Gt);ae.renderInstances(De,Fe,Xe)}else ae.render(De,Fe)};function Ft(T,I,H){T.transparent===!0&&T.side===ii&&T.forceSinglePass===!1?(T.side=Ti,T.needsUpdate=!0,oe(T,I,H),T.side=Zs,T.needsUpdate=!0,oe(T,I,H),T.side=ii):oe(T,I,H)}this.compile=function(T,I,H=null){H===null&&(H=T),m=_e.get(H),m.init(I),y.push(m),H.traverseVisible(function(z){z.isLight&&z.layers.test(I.layers)&&(m.pushLight(z),z.castShadow&&m.pushShadow(z))}),T!==H&&T.traverseVisible(function(z){z.isLight&&z.layers.test(I.layers)&&(m.pushLight(z),z.castShadow&&m.pushShadow(z))}),m.setupLights();let X=new Set;return T.traverse(function(z){if(!(z.isMesh||z.isPoints||z.isLine||z.isSprite))return;let pt=z.material;if(pt)if(Array.isArray(pt))for(let Ct=0;Ct<pt.length;Ct++){let Pt=pt[Ct];Ft(Pt,H,z),X.add(Pt)}else Ft(pt,H,z),X.add(pt)}),y.pop(),m=null,X},this.compileAsync=function(T,I,H=null){let X=this.compile(T,I,H);return new Promise(z=>{function pt(){if(X.forEach(function(Ct){ot.get(Ct).currentProgram.isReady()&&X.delete(Ct)}),X.size===0){z(T);return}setTimeout(pt,10)}ee.get("KHR_parallel_shader_compile")!==null?pt():setTimeout(pt,10)})};let Wt=null;function Ee(T){Wt&&Wt(T)}function Oe(){ln.stop()}function Ie(){ln.start()}let ln=new lT;ln.setAnimationLoop(Ee),typeof self<"u"&&ln.setContext(self),this.setAnimationLoop=function(T){Wt=T,L.setAnimationLoop(T),T===null?ln.stop():ln.start()},L.addEventListener("sessionstart",Oe),L.addEventListener("sessionend",Ie),this.render=function(T,I){if(I!==void 0&&I.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(b===!0)return;if(T.matrixWorldAutoUpdate===!0&&T.updateMatrixWorld(),I.parent===null&&I.matrixWorldAutoUpdate===!0&&I.updateMatrixWorld(),L.enabled===!0&&L.isPresenting===!0&&(L.cameraAutoUpdate===!0&&L.updateCamera(I),I=L.getCamera()),T.isScene===!0&&T.onBeforeRender(_,T,I,A),m=_e.get(T,y.length),m.init(I),y.push(m),St.multiplyMatrices(I.projectionMatrix,I.matrixWorldInverse),ie.setFromProjectionMatrix(St),rt=this.localClippingEnabled,nt=vt.init(this.clippingPlanes,rt),S=Et.get(T,f.length),S.init(),f.push(S),L.enabled===!0&&L.isPresenting===!0){let pt=_.xr.getDepthSensingMesh();pt!==null&&ki(pt,I,-1/0,_.sortObjects)}ki(T,I,0,_.sortObjects),S.finish(),_.sortObjects===!0&&S.sort(Z,wt),me=L.enabled===!1||L.isPresenting===!1||L.hasDepthSensing()===!1,me&&bt.addToRenderList(S,T),this.info.render.frame++,nt===!0&&vt.beginShadows();let H=m.state.shadowsArray;Bt.render(H,T,I),nt===!0&&vt.endShadows(),this.info.autoReset===!0&&this.info.reset();let X=S.opaque,z=S.transmissive;if(m.setupLights(),I.isArrayCamera){let pt=I.cameras;if(z.length>0)for(let Ct=0,Pt=pt.length;Ct<Pt;Ct++){let At=pt[Ct];os(X,z,T,At)}me&&bt.render(T);for(let Ct=0,Pt=pt.length;Ct<Pt;Ct++){let At=pt[Ct];ws(S,T,At,At.viewport)}}else z.length>0&&os(X,z,T,I),me&&bt.render(T),ws(S,T,I);A!==null&&(E.updateMultisampleRenderTarget(A),E.updateRenderTargetMipmap(A)),T.isScene===!0&&T.onAfterRender(_,T,I),k.resetDefaultState(),N=-1,et=null,y.pop(),y.length>0?(m=y[y.length-1],nt===!0&&vt.setGlobalState(_.clippingPlanes,m.state.camera)):m=null,f.pop(),f.length>0?S=f[f.length-1]:S=null};function ki(T,I,H,X){if(T.visible===!1)return;if(T.layers.test(I.layers)){if(T.isGroup)H=T.renderOrder;else if(T.isLOD)T.autoUpdate===!0&&T.update(I);else if(T.isLight)m.pushLight(T),T.castShadow&&m.pushShadow(T);else if(T.isSprite){if(!T.frustumCulled||ie.intersectsSprite(T)){X&&Nt.setFromMatrixPosition(T.matrixWorld).applyMatrix4(St);let Ct=J.update(T),Pt=T.material;Pt.visible&&S.push(T,Ct,Pt,H,Nt.z,null)}}else if((T.isMesh||T.isLine||T.isPoints)&&(!T.frustumCulled||ie.intersectsObject(T))){let Ct=J.update(T),Pt=T.material;if(X&&(T.boundingSphere!==void 0?(T.boundingSphere===null&&T.computeBoundingSphere(),Nt.copy(T.boundingSphere.center)):(Ct.boundingSphere===null&&Ct.computeBoundingSphere(),Nt.copy(Ct.boundingSphere.center)),Nt.applyMatrix4(T.matrixWorld).applyMatrix4(St)),Array.isArray(Pt)){let At=Ct.groups;for(let Qt=0,qt=At.length;Qt<qt;Qt++){let kt=At[Qt],De=Pt[kt.materialIndex];De&&De.visible&&S.push(T,Ct,De,H,Nt.z,kt)}}else Pt.visible&&S.push(T,Ct,Pt,H,Nt.z,null)}}let pt=T.children;for(let Ct=0,Pt=pt.length;Ct<Pt;Ct++)ki(pt[Ct],I,H,X)}function ws(T,I,H,X){let z=T.opaque,pt=T.transmissive,Ct=T.transparent;m.setupLightsView(H),nt===!0&&vt.setGlobalState(_.clippingPlanes,H),X&&j.viewport(v.copy(X)),z.length>0&&vi(z,I,H),pt.length>0&&vi(pt,I,H),Ct.length>0&&vi(Ct,I,H),j.buffers.depth.setTest(!0),j.buffers.depth.setMask(!0),j.buffers.color.setMask(!0),j.setPolygonOffset(!1)}function os(T,I,H,X){if((H.isScene===!0?H.overrideMaterial:null)!==null)return;m.state.transmissionRenderTarget[X.id]===void 0&&(m.state.transmissionRenderTarget[X.id]=new Zn(1,1,{generateMipmaps:!0,type:ee.has("EXT_color_buffer_half_float")||ee.has("EXT_color_buffer_float")?Es:bs,minFilter:uo,samples:4,stencilBuffer:a,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:ze.workingColorSpace}));let pt=m.state.transmissionRenderTarget[X.id],Ct=X.viewport||v;pt.setSize(Ct.z,Ct.w);let Pt=_.getRenderTarget();_.setRenderTarget(pt),_.getClearColor(q),K=_.getClearAlpha(),K<1&&_.setClearColor(16777215,.5),_.clear(),me&&bt.render(H);let At=_.toneMapping;_.toneMapping=Mr;let Qt=X.viewport;if(X.viewport!==void 0&&(X.viewport=void 0),m.setupLightsView(X),nt===!0&&vt.setGlobalState(_.clippingPlanes,X),vi(T,H,X),E.updateMultisampleRenderTarget(pt),E.updateRenderTargetMipmap(pt),ee.has("WEBGL_multisampled_render_to_texture")===!1){let qt=!1;for(let kt=0,De=I.length;kt<De;kt++){let Be=I[kt],Fe=Be.object,en=Be.geometry,ae=Be.material,Gt=Be.group;if(ae.side===ii&&Fe.layers.test(X.layers)){let Xe=ae.side;ae.side=Ti,ae.needsUpdate=!0,Ar(Fe,H,X,en,ae,Gt),ae.side=Xe,ae.needsUpdate=!0,qt=!0}}qt===!0&&(E.updateMultisampleRenderTarget(pt),E.updateRenderTargetMipmap(pt))}_.setRenderTarget(Pt),_.setClearColor(q,K),Qt!==void 0&&(X.viewport=Qt),_.toneMapping=At}function vi(T,I,H){let X=I.isScene===!0?I.overrideMaterial:null;for(let z=0,pt=T.length;z<pt;z++){let Ct=T[z],Pt=Ct.object,At=Ct.geometry,Qt=X===null?Ct.material:X,qt=Ct.group;Pt.layers.test(H.layers)&&Ar(Pt,I,H,At,Qt,qt)}}function Ar(T,I,H,X,z,pt){T.onBeforeRender(_,I,H,X,z,pt),T.modelViewMatrix.multiplyMatrices(H.matrixWorldInverse,T.matrixWorld),T.normalMatrix.getNormalMatrix(T.modelViewMatrix),z.onBeforeRender(_,I,H,X,T,pt),z.transparent===!0&&z.side===ii&&z.forceSinglePass===!1?(z.side=Ti,z.needsUpdate=!0,_.renderBufferDirect(H,I,X,z,T,pt),z.side=Zs,z.needsUpdate=!0,_.renderBufferDirect(H,I,X,z,T,pt),z.side=ii):_.renderBufferDirect(H,I,X,z,T,pt),T.onAfterRender(_,I,H,X,z,pt)}function oe(T,I,H){I.isScene!==!0&&(I=Vt);let X=ot.get(T),z=m.state.lights,pt=m.state.shadowsArray,Ct=z.state.version,Pt=Ot.getParameters(T,z.state,pt,I,H),At=Ot.getProgramCacheKey(Pt),Qt=X.programs;X.environment=T.isMeshStandardMaterial?I.environment:null,X.fog=I.fog,X.envMap=(T.isMeshStandardMaterial?P:x).get(T.envMap||X.environment),X.envMapRotation=X.environment!==null&&T.envMap===null?I.environmentRotation:T.envMapRotation,Qt===void 0&&(T.addEventListener("dispose",Tt),Qt=new Map,X.programs=Qt);let qt=Qt.get(At);if(qt!==void 0){if(X.currentProgram===qt&&X.lightsStateVersion===Ct)return Kn(T,Pt),qt}else Pt.uniforms=Ot.getUniforms(T),T.onBeforeCompile(Pt,_),qt=Ot.acquireProgram(Pt,At),Qt.set(At,qt),X.uniforms=Pt.uniforms;let kt=X.uniforms;return(!T.isShaderMaterial&&!T.isRawShaderMaterial||T.clipping===!0)&&(kt.clippingPlanes=vt.uniform),Kn(T,Pt),X.needsLights=jn(T),X.lightsStateVersion=Ct,X.needsLights&&(kt.ambientLightColor.value=z.state.ambient,kt.lightProbe.value=z.state.probe,kt.directionalLights.value=z.state.directional,kt.directionalLightShadows.value=z.state.directionalShadow,kt.spotLights.value=z.state.spot,kt.spotLightShadows.value=z.state.spotShadow,kt.rectAreaLights.value=z.state.rectArea,kt.ltc_1.value=z.state.rectAreaLTC1,kt.ltc_2.value=z.state.rectAreaLTC2,kt.pointLights.value=z.state.point,kt.pointLightShadows.value=z.state.pointShadow,kt.hemisphereLights.value=z.state.hemi,kt.directionalShadowMap.value=z.state.directionalShadowMap,kt.directionalShadowMatrix.value=z.state.directionalShadowMatrix,kt.spotShadowMap.value=z.state.spotShadowMap,kt.spotLightMatrix.value=z.state.spotLightMatrix,kt.spotLightMap.value=z.state.spotLightMap,kt.pointShadowMap.value=z.state.pointShadowMap,kt.pointShadowMatrix.value=z.state.pointShadowMatrix),X.currentProgram=qt,X.uniformsList=null,qt}function Te(T){if(T.uniformsList===null){let I=T.currentProgram.getUniforms();T.uniformsList=Ql.seqWithValue(I.seq,T.uniforms)}return T.uniformsList}function Kn(T,I){let H=ot.get(T);H.outputColorSpace=I.outputColorSpace,H.batching=I.batching,H.batchingColor=I.batchingColor,H.instancing=I.instancing,H.instancingColor=I.instancingColor,H.instancingMorph=I.instancingMorph,H.skinning=I.skinning,H.morphTargets=I.morphTargets,H.morphNormals=I.morphNormals,H.morphColors=I.morphColors,H.morphTargetsCount=I.morphTargetsCount,H.numClippingPlanes=I.numClippingPlanes,H.numIntersection=I.numClipIntersection,H.vertexAlphas=I.vertexAlphas,H.vertexTangents=I.vertexTangents,H.toneMapping=I.toneMapping}function ri(T,I,H,X,z){I.isScene!==!0&&(I=Vt),E.resetTextureUnits();let pt=I.fog,Ct=X.isMeshStandardMaterial?I.environment:null,Pt=A===null?_.outputColorSpace:A.isXRRenderTarget===!0?A.texture.colorSpace:js,At=(X.isMeshStandardMaterial?P:x).get(X.envMap||Ct),Qt=X.vertexColors===!0&&!!H.attributes.color&&H.attributes.color.itemSize===4,qt=!!H.attributes.tangent&&(!!X.normalMap||X.anisotropy>0),kt=!!H.morphAttributes.position,De=!!H.morphAttributes.normal,Be=!!H.morphAttributes.color,Fe=Mr;X.toneMapped&&(A===null||A.isXRRenderTarget===!0)&&(Fe=_.toneMapping);let en=H.morphAttributes.position||H.morphAttributes.normal||H.morphAttributes.color,ae=en!==void 0?en.length:0,Gt=ot.get(X),Xe=m.state.lights;if(nt===!0&&(rt===!0||T!==et)){let re=T===et&&X.id===N;vt.setState(X,T,re)}let Ae=!1;X.version===Gt.__version?(Gt.needsLights&&Gt.lightsStateVersion!==Xe.state.version||Gt.outputColorSpace!==Pt||z.isBatchedMesh&&Gt.batching===!1||!z.isBatchedMesh&&Gt.batching===!0||z.isBatchedMesh&&Gt.batchingColor===!0&&z.colorTexture===null||z.isBatchedMesh&&Gt.batchingColor===!1&&z.colorTexture!==null||z.isInstancedMesh&&Gt.instancing===!1||!z.isInstancedMesh&&Gt.instancing===!0||z.isSkinnedMesh&&Gt.skinning===!1||!z.isSkinnedMesh&&Gt.skinning===!0||z.isInstancedMesh&&Gt.instancingColor===!0&&z.instanceColor===null||z.isInstancedMesh&&Gt.instancingColor===!1&&z.instanceColor!==null||z.isInstancedMesh&&Gt.instancingMorph===!0&&z.morphTexture===null||z.isInstancedMesh&&Gt.instancingMorph===!1&&z.morphTexture!==null||Gt.envMap!==At||X.fog===!0&&Gt.fog!==pt||Gt.numClippingPlanes!==void 0&&(Gt.numClippingPlanes!==vt.numPlanes||Gt.numIntersection!==vt.numIntersection)||Gt.vertexAlphas!==Qt||Gt.vertexTangents!==qt||Gt.morphTargets!==kt||Gt.morphNormals!==De||Gt.morphColors!==Be||Gt.toneMapping!==Fe||Gt.morphTargetsCount!==ae)&&(Ae=!0):(Ae=!0,Gt.__version=X.version);let Hn=Gt.currentProgram;Ae===!0&&(Hn=oe(X,I,z));let ge=!1,Un=!1,hn=!1,pe=Hn.getUniforms(),Ri=Gt.uniforms;if(j.useProgram(Hn.program)&&(ge=!0,Un=!0,hn=!0),X.id!==N&&(N=X.id,Un=!0),ge||et!==T){ce.reverseDepthBuffer?(Rt.copy(T.projectionMatrix),g3(Rt),v3(Rt),pe.setValue(C,"projectionMatrix",Rt)):pe.setValue(C,"projectionMatrix",T.projectionMatrix),pe.setValue(C,"viewMatrix",T.matrixWorldInverse);let re=pe.map.cameraPosition;re!==void 0&&re.setValue(C,Kt.setFromMatrixPosition(T.matrixWorld)),ce.logarithmicDepthBuffer&&pe.setValue(C,"logDepthBufFC",2/(Math.log(T.far+1)/Math.LN2)),(X.isMeshPhongMaterial||X.isMeshToonMaterial||X.isMeshLambertMaterial||X.isMeshBasicMaterial||X.isMeshStandardMaterial||X.isShaderMaterial)&&pe.setValue(C,"isOrthographic",T.isOrthographicCamera===!0),et!==T&&(et=T,Un=!0,hn=!0)}if(z.isSkinnedMesh){pe.setOptional(C,z,"bindMatrix"),pe.setOptional(C,z,"bindMatrixInverse");let re=z.skeleton;re&&(re.boneTexture===null&&re.computeBoneTexture(),pe.setValue(C,"boneTexture",re.boneTexture,E))}z.isBatchedMesh&&(pe.setOptional(C,z,"batchingTexture"),pe.setValue(C,"batchingTexture",z._matricesTexture,E),pe.setOptional(C,z,"batchingIdTexture"),pe.setValue(C,"batchingIdTexture",z._indirectTexture,E),pe.setOptional(C,z,"batchingColorTexture"),z._colorsTexture!==null&&pe.setValue(C,"batchingColorTexture",z._colorsTexture,E));let oi=H.morphAttributes;if((oi.position!==void 0||oi.normal!==void 0||oi.color!==void 0)&&$t.update(z,H,Hn),(Un||Gt.receiveShadow!==z.receiveShadow)&&(Gt.receiveShadow=z.receiveShadow,pe.setValue(C,"receiveShadow",z.receiveShadow)),X.isMeshGouraudMaterial&&X.envMap!==null&&(Ri.envMap.value=At,Ri.flipEnvMap.value=At.isCubeTexture&&At.isRenderTargetTexture===!1?-1:1),X.isMeshStandardMaterial&&X.envMap===null&&I.environment!==null&&(Ri.envMapIntensity.value=I.environmentIntensity),Un&&(pe.setValue(C,"toneMappingExposure",_.toneMappingExposure),Gt.needsLights&&wi(Ri,hn),pt&&X.fog===!0&&Mt.refreshFogUniforms(Ri,pt),Mt.refreshMaterialUniforms(Ri,X,ct,B,m.state.transmissionRenderTarget[T.id]),Ql.upload(C,Te(Gt),Ri,E)),X.isShaderMaterial&&X.uniformsNeedUpdate===!0&&(Ql.upload(C,Te(Gt),Ri,E),X.uniformsNeedUpdate=!1),X.isSpriteMaterial&&pe.setValue(C,"center",z.center),pe.setValue(C,"modelViewMatrix",z.modelViewMatrix),pe.setValue(C,"normalMatrix",z.normalMatrix),pe.setValue(C,"modelMatrix",z.matrixWorld),X.isShaderMaterial||X.isRawShaderMaterial){let re=X.uniformsGroups;for(let wr=0,So=re.length;wr<So;wr++){let Ln=re[wr];w.update(Ln,Hn),w.bind(Ln,Hn)}}return Hn}function wi(T,I){T.ambientLightColor.needsUpdate=I,T.lightProbe.needsUpdate=I,T.directionalLights.needsUpdate=I,T.directionalLightShadows.needsUpdate=I,T.pointLights.needsUpdate=I,T.pointLightShadows.needsUpdate=I,T.spotLights.needsUpdate=I,T.spotLightShadows.needsUpdate=I,T.rectAreaLights.needsUpdate=I,T.hemisphereLights.needsUpdate=I}function jn(T){return T.isMeshLambertMaterial||T.isMeshToonMaterial||T.isMeshPhongMaterial||T.isMeshStandardMaterial||T.isShadowMaterial||T.isShaderMaterial&&T.lights===!0}this.getActiveCubeFace=function(){return D},this.getActiveMipmapLevel=function(){return R},this.getRenderTarget=function(){return A},this.setRenderTargetTextures=function(T,I,H){ot.get(T.texture).__webglTexture=I,ot.get(T.depthTexture).__webglTexture=H;let X=ot.get(T);X.__hasExternalTextures=!0,X.__autoAllocateDepthBuffer=H===void 0,X.__autoAllocateDepthBuffer||ee.has("WEBGL_multisampled_render_to_texture")===!0&&(console.warn("THREE.WebGLRenderer: Render-to-texture extension was disabled because an external texture was provided"),X.__useRenderToTexture=!1)},this.setRenderTargetFramebuffer=function(T,I){let H=ot.get(T);H.__webglFramebuffer=I,H.__useDefaultFramebuffer=I===void 0},this.setRenderTarget=function(T,I=0,H=0){A=T,D=I,R=H;let X=!0,z=null,pt=!1,Ct=!1;if(T){let At=ot.get(T);if(At.__useDefaultFramebuffer!==void 0)j.bindFramebuffer(C.FRAMEBUFFER,null),X=!1;else if(At.__webglFramebuffer===void 0)E.setupRenderTarget(T);else if(At.__hasExternalTextures)E.rebindTextures(T,ot.get(T.texture).__webglTexture,ot.get(T.depthTexture).__webglTexture);else if(T.depthBuffer){let kt=T.depthTexture;if(At.__boundDepthTexture!==kt){if(kt!==null&&ot.has(kt)&&(T.width!==kt.image.width||T.height!==kt.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");E.setupDepthRenderbuffer(T)}}let Qt=T.texture;(Qt.isData3DTexture||Qt.isDataArrayTexture||Qt.isCompressedArrayTexture)&&(Ct=!0);let qt=ot.get(T).__webglFramebuffer;T.isWebGLCubeRenderTarget?(Array.isArray(qt[I])?z=qt[I][H]:z=qt[I],pt=!0):T.samples>0&&E.useMultisampledRTT(T)===!1?z=ot.get(T).__webglMultisampledFramebuffer:Array.isArray(qt)?z=qt[H]:z=qt,v.copy(T.viewport),M.copy(T.scissor),F=T.scissorTest}else v.copy(mt).multiplyScalar(ct).floor(),M.copy(ft).multiplyScalar(ct).floor(),F=Ht;if(j.bindFramebuffer(C.FRAMEBUFFER,z)&&X&&j.drawBuffers(T,z),j.viewport(v),j.scissor(M),j.setScissorTest(F),pt){let At=ot.get(T.texture);C.framebufferTexture2D(C.FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_CUBE_MAP_POSITIVE_X+I,At.__webglTexture,H)}else if(Ct){let At=ot.get(T.texture),Qt=I||0;C.framebufferTextureLayer(C.FRAMEBUFFER,C.COLOR_ATTACHMENT0,At.__webglTexture,H||0,Qt)}N=-1},this.readRenderTargetPixels=function(T,I,H,X,z,pt,Ct){if(!(T&&T.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Pt=ot.get(T).__webglFramebuffer;if(T.isWebGLCubeRenderTarget&&Ct!==void 0&&(Pt=Pt[Ct]),Pt){j.bindFramebuffer(C.FRAMEBUFFER,Pt);try{let At=T.texture,Qt=At.format,qt=At.type;if(!ce.textureFormatReadable(Qt)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!ce.textureTypeReadable(qt)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}I>=0&&I<=T.width-X&&H>=0&&H<=T.height-z&&C.readPixels(I,H,X,z,O.convert(Qt),O.convert(qt),pt)}finally{let At=A!==null?ot.get(A).__webglFramebuffer:null;j.bindFramebuffer(C.FRAMEBUFFER,At)}}},this.readRenderTargetPixelsAsync=async function(T,I,H,X,z,pt,Ct){if(!(T&&T.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Pt=ot.get(T).__webglFramebuffer;if(T.isWebGLCubeRenderTarget&&Ct!==void 0&&(Pt=Pt[Ct]),Pt){let At=T.texture,Qt=At.format,qt=At.type;if(!ce.textureFormatReadable(Qt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!ce.textureTypeReadable(qt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");if(I>=0&&I<=T.width-X&&H>=0&&H<=T.height-z){j.bindFramebuffer(C.FRAMEBUFFER,Pt);let kt=C.createBuffer();C.bindBuffer(C.PIXEL_PACK_BUFFER,kt),C.bufferData(C.PIXEL_PACK_BUFFER,pt.byteLength,C.STREAM_READ),C.readPixels(I,H,X,z,O.convert(Qt),O.convert(qt),0);let De=A!==null?ot.get(A).__webglFramebuffer:null;j.bindFramebuffer(C.FRAMEBUFFER,De);let Be=C.fenceSync(C.SYNC_GPU_COMMANDS_COMPLETE,0);return C.flush(),await m3(C,Be,4),C.bindBuffer(C.PIXEL_PACK_BUFFER,kt),C.getBufferSubData(C.PIXEL_PACK_BUFFER,0,pt),C.deleteBuffer(kt),C.deleteSync(Be),pt}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")}},this.copyFramebufferToTexture=function(T,I=null,H=0){T.isTexture!==!0&&(pd("WebGLRenderer: copyFramebufferToTexture function signature has changed."),I=arguments[0]||null,T=arguments[1]);let X=Math.pow(2,-H),z=Math.floor(T.image.width*X),pt=Math.floor(T.image.height*X),Ct=I!==null?I.x:0,Pt=I!==null?I.y:0;E.setTexture2D(T,0),C.copyTexSubImage2D(C.TEXTURE_2D,H,0,0,Ct,Pt,z,pt),j.unbindTexture()},this.copyTextureToTexture=function(T,I,H=null,X=null,z=0){T.isTexture!==!0&&(pd("WebGLRenderer: copyTextureToTexture function signature has changed."),X=arguments[0]||null,T=arguments[1],I=arguments[2],z=arguments[3]||0,H=null);let pt,Ct,Pt,At,Qt,qt;H!==null?(pt=H.max.x-H.min.x,Ct=H.max.y-H.min.y,Pt=H.min.x,At=H.min.y):(pt=T.image.width,Ct=T.image.height,Pt=0,At=0),X!==null?(Qt=X.x,qt=X.y):(Qt=0,qt=0);let kt=O.convert(I.format),De=O.convert(I.type);E.setTexture2D(I,0),C.pixelStorei(C.UNPACK_FLIP_Y_WEBGL,I.flipY),C.pixelStorei(C.UNPACK_PREMULTIPLY_ALPHA_WEBGL,I.premultiplyAlpha),C.pixelStorei(C.UNPACK_ALIGNMENT,I.unpackAlignment);let Be=C.getParameter(C.UNPACK_ROW_LENGTH),Fe=C.getParameter(C.UNPACK_IMAGE_HEIGHT),en=C.getParameter(C.UNPACK_SKIP_PIXELS),ae=C.getParameter(C.UNPACK_SKIP_ROWS),Gt=C.getParameter(C.UNPACK_SKIP_IMAGES),Xe=T.isCompressedTexture?T.mipmaps[z]:T.image;C.pixelStorei(C.UNPACK_ROW_LENGTH,Xe.width),C.pixelStorei(C.UNPACK_IMAGE_HEIGHT,Xe.height),C.pixelStorei(C.UNPACK_SKIP_PIXELS,Pt),C.pixelStorei(C.UNPACK_SKIP_ROWS,At),T.isDataTexture?C.texSubImage2D(C.TEXTURE_2D,z,Qt,qt,pt,Ct,kt,De,Xe.data):T.isCompressedTexture?C.compressedTexSubImage2D(C.TEXTURE_2D,z,Qt,qt,Xe.width,Xe.height,kt,Xe.data):C.texSubImage2D(C.TEXTURE_2D,z,Qt,qt,pt,Ct,kt,De,Xe),C.pixelStorei(C.UNPACK_ROW_LENGTH,Be),C.pixelStorei(C.UNPACK_IMAGE_HEIGHT,Fe),C.pixelStorei(C.UNPACK_SKIP_PIXELS,en),C.pixelStorei(C.UNPACK_SKIP_ROWS,ae),C.pixelStorei(C.UNPACK_SKIP_IMAGES,Gt),z===0&&I.generateMipmaps&&C.generateMipmap(C.TEXTURE_2D),j.unbindTexture()},this.copyTextureToTexture3D=function(T,I,H=null,X=null,z=0){T.isTexture!==!0&&(pd("WebGLRenderer: copyTextureToTexture3D function signature has changed."),H=arguments[0]||null,X=arguments[1]||null,T=arguments[2],I=arguments[3],z=arguments[4]||0);let pt,Ct,Pt,At,Qt,qt,kt,De,Be,Fe=T.isCompressedTexture?T.mipmaps[z]:T.image;H!==null?(pt=H.max.x-H.min.x,Ct=H.max.y-H.min.y,Pt=H.max.z-H.min.z,At=H.min.x,Qt=H.min.y,qt=H.min.z):(pt=Fe.width,Ct=Fe.height,Pt=Fe.depth,At=0,Qt=0,qt=0),X!==null?(kt=X.x,De=X.y,Be=X.z):(kt=0,De=0,Be=0);let en=O.convert(I.format),ae=O.convert(I.type),Gt;if(I.isData3DTexture)E.setTexture3D(I,0),Gt=C.TEXTURE_3D;else if(I.isDataArrayTexture||I.isCompressedArrayTexture)E.setTexture2DArray(I,0),Gt=C.TEXTURE_2D_ARRAY;else{console.warn("THREE.WebGLRenderer.copyTextureToTexture3D: only supports THREE.DataTexture3D and THREE.DataTexture2DArray.");return}C.pixelStorei(C.UNPACK_FLIP_Y_WEBGL,I.flipY),C.pixelStorei(C.UNPACK_PREMULTIPLY_ALPHA_WEBGL,I.premultiplyAlpha),C.pixelStorei(C.UNPACK_ALIGNMENT,I.unpackAlignment);let Xe=C.getParameter(C.UNPACK_ROW_LENGTH),Ae=C.getParameter(C.UNPACK_IMAGE_HEIGHT),Hn=C.getParameter(C.UNPACK_SKIP_PIXELS),ge=C.getParameter(C.UNPACK_SKIP_ROWS),Un=C.getParameter(C.UNPACK_SKIP_IMAGES);C.pixelStorei(C.UNPACK_ROW_LENGTH,Fe.width),C.pixelStorei(C.UNPACK_IMAGE_HEIGHT,Fe.height),C.pixelStorei(C.UNPACK_SKIP_PIXELS,At),C.pixelStorei(C.UNPACK_SKIP_ROWS,Qt),C.pixelStorei(C.UNPACK_SKIP_IMAGES,qt),T.isDataTexture||T.isData3DTexture?C.texSubImage3D(Gt,z,kt,De,Be,pt,Ct,Pt,en,ae,Fe.data):I.isCompressedArrayTexture?C.compressedTexSubImage3D(Gt,z,kt,De,Be,pt,Ct,Pt,en,Fe.data):C.texSubImage3D(Gt,z,kt,De,Be,pt,Ct,Pt,en,ae,Fe),C.pixelStorei(C.UNPACK_ROW_LENGTH,Xe),C.pixelStorei(C.UNPACK_IMAGE_HEIGHT,Ae),C.pixelStorei(C.UNPACK_SKIP_PIXELS,Hn),C.pixelStorei(C.UNPACK_SKIP_ROWS,ge),C.pixelStorei(C.UNPACK_SKIP_IMAGES,Un),z===0&&I.generateMipmaps&&C.generateMipmap(Gt),j.unbindTexture()},this.initRenderTarget=function(T){ot.get(T).__webglFramebuffer===void 0&&E.setupRenderTarget(T)},this.initTexture=function(T){T.isCubeTexture?E.setTextureCube(T,0):T.isData3DTexture?E.setTexture3D(T,0):T.isDataArrayTexture||T.isCompressedArrayTexture?E.setTexture2DArray(T,0):E.setTexture2D(T,0),j.unbindTexture()},this.resetState=function(){D=0,R=0,A=null,j.reset(),k.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Aa}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;let n=this.getContext();n.drawingBufferColorSpace=t===my?"display-p3":"srgb",n.unpackColorSpace=ze.workingColorSpace===Vd?"display-p3":"srgb"}},Ld=class extends ss{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Ca,this.environmentIntensity=1,this.environmentRotation=new Ca,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,n){return super.copy(t,n),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){let n=super.toJSON(t);return this.fog!==null&&(n.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(n.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(n.object.backgroundIntensity=this.backgroundIntensity),n.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(n.object.environmentIntensity=this.environmentIntensity),n.object.environmentRotation=this.environmentRotation.toArray(),n}},Na=class extends qe{constructor(t,n,i,s=1){super(t,n,i),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=s}copy(t){return super.copy(t),this.meshPerAttribute=t.meshPerAttribute,this}toJSON(){let t=super.toJSON();return t.meshPerAttribute=this.meshPerAttribute,t.isInstancedBufferAttribute=!0,t}},ac=class extends po{constructor(t){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new fe(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.alphaMap=t.alphaMap,this.size=t.size,this.sizeAttenuation=t.sizeAttenuation,this.fog=t.fog,this}},VE=new pn,Jv=new ic,rd=new nc,od=new W,Od=class extends ss{constructor(t=new En,n=new ac){super(),this.isPoints=!0,this.type="Points",this.geometry=t,this.material=n,this.updateMorphTargets()}copy(t,n){return super.copy(t,n),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}raycast(t,n){let i=this.geometry,s=this.matrixWorld,a=t.params.Points.threshold,r=i.drawRange;if(i.boundingSphere===null&&i.computeBoundingSphere(),rd.copy(i.boundingSphere),rd.applyMatrix4(s),rd.radius+=a,t.ray.intersectsSphere(rd)===!1)return;VE.copy(s).invert(),Jv.copy(t.ray).applyMatrix4(VE);let o=a/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=i.index,d=i.attributes.position;if(c!==null){let h=Math.max(0,r.start),p=Math.min(c.count,r.start+r.count);for(let g=h,S=p;g<S;g++){let m=c.getX(g);od.fromBufferAttribute(d,m),GE(od,m,l,s,t,n,this)}}else{let h=Math.max(0,r.start),p=Math.min(d.count,r.start+r.count);for(let g=h,S=p;g<S;g++)od.fromBufferAttribute(d,g),GE(od,g,l,s,t,n,this)}}updateMorphTargets(){let n=this.geometry.morphAttributes,i=Object.keys(n);if(i.length>0){let s=n[i[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let a=0,r=s.length;a<r;a++){let o=s[a].name||String(a);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=a}}}}};Id=class extends Gi{constructor(t,n,i,s,a,r,o,l,c){super(t,n,i,s,a,r,o,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}};rc=class{constructor(t,n,i,s){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=s!==void 0?s:new n.constructor(i),this.sampleValues=n,this.valueSize=i,this.settings=null,this.DefaultSettings_={}}evaluate(t){let n=this.parameterPositions,i=this._cachedIndex,s=n[i],a=n[i-1];t:{e:{let r;n:{i:if(!(t<s)){for(let o=i+2;;){if(s===void 0){if(t<a)break i;return i=n.length,this._cachedIndex=i,this.copySampleValue_(i-1)}if(i===o)break;if(a=s,s=n[++i],t<s)break e}r=n.length;break n}if(!(t>=a)){let o=n[1];t<o&&(i=2,a=o);for(let l=i-2;;){if(a===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===l)break;if(s=a,a=n[--i-1],t>=a)break e}r=i,i=0;break n}break t}for(;i<r;){let o=i+r>>>1;t<n[o]?r=o:i=o+1}if(s=n[i],a=n[i-1],a===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(s===void 0)return i=n.length,this._cachedIndex=i,this.copySampleValue_(i-1)}this._cachedIndex=i,this.intervalChanged_(i,a,s)}return this.interpolate_(i,a,t,s)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){let n=this.resultBuffer,i=this.sampleValues,s=this.valueSize,a=t*s;for(let r=0;r!==s;++r)n[r]=i[a+r];return n}interpolate_(){throw new Error("call to abstract method")}intervalChanged_(){}},$v=class extends rc{constructor(t,n,i,s){super(t,n,i,s),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:ZM,endingEnd:ZM}}intervalChanged_(t,n,i){let s=this.parameterPositions,a=t-2,r=t+1,o=s[a],l=s[r];if(o===void 0)switch(this.getSettings_().endingStart){case KM:a=t,o=2*n-i;break;case jM:a=s.length-2,o=n+s[a]-s[a+1];break;default:a=t,o=i}if(l===void 0)switch(this.getSettings_().endingEnd){case KM:r=t,l=2*i-n;break;case jM:r=1,l=i+s[1]-s[0];break;default:r=t-1,l=n}let c=(i-n)*.5,u=this.valueSize;this._weightPrev=c/(n-o),this._weightNext=c/(l-i),this._offsetPrev=a*u,this._offsetNext=r*u}interpolate_(t,n,i,s){let a=this.resultBuffer,r=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,u=this._offsetPrev,d=this._offsetNext,h=this._weightPrev,p=this._weightNext,g=(i-n)/(s-n),S=g*g,m=S*g,f=-h*m+2*h*S-h*g,y=(1+h)*m+(-1.5-2*h)*S+(-.5+h)*g+1,_=(-1-p)*m+(1.5+p)*S+.5*g,b=p*m-p*S;for(let D=0;D!==o;++D)a[D]=f*r[u+D]+y*r[c+D]+_*r[l+D]+b*r[d+D];return a}},ty=class extends rc{constructor(t,n,i,s){super(t,n,i,s)}interpolate_(t,n,i,s){let a=this.resultBuffer,r=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,u=(i-n)/(s-n),d=1-u;for(let h=0;h!==o;++h)a[h]=r[c+h]*d+r[l+h]*u;return a}},ey=class extends rc{constructor(t,n,i,s){super(t,n,i,s)}interpolate_(t){return this.copySampleValue_(t-1)}},Ms=class{constructor(t,n,i,s){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(n===void 0||n.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=ld(n,this.TimeBufferType),this.values=ld(i,this.ValueBufferType),this.setInterpolation(s||this.DefaultInterpolation)}static toJSON(t){let n=t.constructor,i;if(n.toJSON!==this.toJSON)i=n.toJSON(t);else{i={name:t.name,times:ld(t.times,Array),values:ld(t.values,Array)};let s=t.getInterpolation();s!==t.DefaultInterpolation&&(i.interpolation=s)}return i.type=t.ValueTypeName,i}InterpolantFactoryMethodDiscrete(t){return new ey(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new ty(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new $v(this.times,this.values,this.getValueSize(),t)}setInterpolation(t){let n;switch(t){case md:n=this.InterpolantFactoryMethodDiscrete;break;case Iv:n=this.InterpolantFactoryMethodLinear;break;case Mg:n=this.InterpolantFactoryMethodSmooth;break}if(n===void 0){let i="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(i);return console.warn("THREE.KeyframeTrack:",i),this}return this.createInterpolant=n,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return md;case this.InterpolantFactoryMethodLinear:return Iv;case this.InterpolantFactoryMethodSmooth:return Mg}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){let n=this.times;for(let i=0,s=n.length;i!==s;++i)n[i]+=t}return this}scale(t){if(t!==1){let n=this.times;for(let i=0,s=n.length;i!==s;++i)n[i]*=t}return this}trim(t,n){let i=this.times,s=i.length,a=0,r=s-1;for(;a!==s&&i[a]<t;)++a;for(;r!==-1&&i[r]>n;)--r;if(++r,a!==0||r!==s){a>=r&&(r=Math.max(r,1),a=r-1);let o=this.getValueSize();this.times=i.slice(a,r),this.values=this.values.slice(a*o,r*o)}return this}validate(){let t=!0,n=this.getValueSize();n-Math.floor(n)!==0&&(console.error("THREE.KeyframeTrack: Invalid value size in track.",this),t=!1);let i=this.times,s=this.values,a=i.length;a===0&&(console.error("THREE.KeyframeTrack: Track is empty.",this),t=!1);let r=null;for(let o=0;o!==a;o++){let l=i[o];if(typeof l=="number"&&isNaN(l)){console.error("THREE.KeyframeTrack: Time is not a valid number.",this,o,l),t=!1;break}if(r!==null&&r>l){console.error("THREE.KeyframeTrack: Out of order keys.",this,o,l,r),t=!1;break}r=l}if(s!==void 0&&hO(s))for(let o=0,l=s.length;o!==l;++o){let c=s[o];if(isNaN(c)){console.error("THREE.KeyframeTrack: Value is not a valid number.",this,o,c),t=!1;break}}return t}optimize(){let t=this.times.slice(),n=this.values.slice(),i=this.getValueSize(),s=this.getInterpolation()===Mg,a=t.length-1,r=1;for(let o=1;o<a;++o){let l=!1,c=t[o],u=t[o+1];if(c!==u&&(o!==1||c!==t[0]))if(s)l=!0;else{let d=o*i,h=d-i,p=d+i;for(let g=0;g!==i;++g){let S=n[d+g];if(S!==n[h+g]||S!==n[p+g]){l=!0;break}}}if(l){if(o!==r){t[r]=t[o];let d=o*i,h=r*i;for(let p=0;p!==i;++p)n[h+p]=n[d+p]}++r}}if(a>0){t[r]=t[a];for(let o=a*i,l=r*i,c=0;c!==i;++c)n[l+c]=n[o+c];++r}return r!==t.length?(this.times=t.slice(0,r),this.values=n.slice(0,r*i)):(this.times=t,this.values=n),this}clone(){let t=this.times.slice(),n=this.values.slice(),i=this.constructor,s=new i(this.name,t,n);return s.createInterpolant=this.createInterpolant,s}};Ms.prototype.TimeBufferType=Float32Array;Ms.prototype.ValueBufferType=Float32Array;Ms.prototype.DefaultInterpolation=Iv;mo=class extends Ms{constructor(t,n,i){super(t,n,i)}};mo.prototype.ValueTypeName="bool";mo.prototype.ValueBufferType=Array;mo.prototype.DefaultInterpolation=md;mo.prototype.InterpolantFactoryMethodLinear=void 0;mo.prototype.InterpolantFactoryMethodSmooth=void 0;ny=class extends Ms{};ny.prototype.ValueTypeName="color";iy=class extends Ms{};iy.prototype.ValueTypeName="number";sy=class extends rc{constructor(t,n,i,s){super(t,n,i,s)}interpolate_(t,n,i,s){let a=this.resultBuffer,r=this.sampleValues,o=this.valueSize,l=(i-n)/(s-n),c=t*o;for(let u=c+o;c!==u;c+=4)Ss.slerpFlat(a,0,r,c-o,r,c,l);return a}},Pd=class extends Ms{InterpolantFactoryMethodLinear(t){return new sy(this.times,this.values,this.getValueSize(),t)}};Pd.prototype.ValueTypeName="quaternion";Pd.prototype.InterpolantFactoryMethodSmooth=void 0;go=class extends Ms{constructor(t,n,i){super(t,n,i)}};go.prototype.ValueTypeName="string";go.prototype.ValueBufferType=Array;go.prototype.DefaultInterpolation=md;go.prototype.InterpolantFactoryMethodLinear=void 0;go.prototype.InterpolantFactoryMethodSmooth=void 0;ay=class extends Ms{};ay.prototype.ValueTypeName="vector";ry=class{constructor(t,n,i){let s=this,a=!1,r=0,o=0,l,c=[];this.onStart=void 0,this.onLoad=t,this.onProgress=n,this.onError=i,this.itemStart=function(u){o++,a===!1&&s.onStart!==void 0&&s.onStart(u,r,o),a=!0},this.itemEnd=function(u){r++,s.onProgress!==void 0&&s.onProgress(u,r,o),r===o&&(a=!1,s.onLoad!==void 0&&s.onLoad())},this.itemError=function(u){s.onError!==void 0&&s.onError(u)},this.resolveURL=function(u){return l?l(u):u},this.setURLModifier=function(u){return l=u,this},this.addHandler=function(u,d){return c.push(u,d),this},this.removeHandler=function(u){let d=c.indexOf(u);return d!==-1&&c.splice(d,2),this},this.getHandler=function(u){for(let d=0,h=c.length;d<h;d+=2){let p=c[d],g=c[d+1];if(p.global&&(p.lastIndex=0),p.test(u))return g}return null}}},fO=new ry,oy=class{constructor(t){this.manager=t!==void 0?t:fO,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(t,n){let i=this;return new Promise(function(s,a){i.load(t,s,n,a)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}};oy.DEFAULT_MATERIAL_NAME="__DEFAULT";zd=class extends En{constructor(){super(),this.isInstancedBufferGeometry=!0,this.type="InstancedBufferGeometry",this.instanceCount=1/0}copy(t){return super.copy(t),this.instanceCount=t.instanceCount,this}toJSON(){let t=super.toJSON();return t.instanceCount=this.instanceCount,t.isInstancedBufferGeometry=!0,t}},Bd=class{constructor(t=!0){this.autoStart=t,this.startTime=0,this.oldTime=0,this.elapsedTime=0,this.running=!1}start(){this.startTime=kE(),this.oldTime=this.startTime,this.elapsedTime=0,this.running=!0}stop(){this.getElapsedTime(),this.running=!1,this.autoStart=!1}getElapsedTime(){return this.getDelta(),this.elapsedTime}getDelta(){let t=0;if(this.autoStart&&!this.running)return this.start(),0;if(this.running){let n=kE();t=(n-this.oldTime)/1e3,this.oldTime=n,this.elapsedTime+=t}return t}};yy="\\[\\]\\.:\\/",dO=new RegExp("["+yy+"]","g"),_y="[^"+yy+"]",pO="[^"+yy.replace("\\.","")+"]",mO=/((?:WC+[\/:])*)/.source.replace("WC",_y),gO=/(WCOD+)?/.source.replace("WCOD",pO),vO=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",_y),yO=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",_y),_O=new RegExp("^"+mO+gO+vO+yO+"$"),xO=["material","materials","bones","map"],ly=class{constructor(t,n,i){let s=i||on.parseTrackName(n);this._targetGroup=t,this._bindings=t.subscribe_(n,s)}getValue(t,n){this.bind();let i=this._targetGroup.nCachedObjects_,s=this._bindings[i];s!==void 0&&s.getValue(t,n)}setValue(t,n){let i=this._bindings;for(let s=this._targetGroup.nCachedObjects_,a=i.length;s!==a;++s)i[s].setValue(t,n)}bind(){let t=this._bindings;for(let n=this._targetGroup.nCachedObjects_,i=t.length;n!==i;++n)t[n].bind()}unbind(){let t=this._bindings;for(let n=this._targetGroup.nCachedObjects_,i=t.length;n!==i;++n)t[n].unbind()}},on=class e{constructor(t,n,i){this.path=n,this.parsedPath=i||e.parseTrackName(n),this.node=e.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,n,i){return t&&t.isAnimationObjectGroup?new e.Composite(t,n,i):new e(t,n,i)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace(dO,"")}static parseTrackName(t){let n=_O.exec(t);if(n===null)throw new Error("PropertyBinding: Cannot parse trackName: "+t);let i={nodeName:n[2],objectName:n[3],objectIndex:n[4],propertyName:n[5],propertyIndex:n[6]},s=i.nodeName&&i.nodeName.lastIndexOf(".");if(s!==void 0&&s!==-1){let a=i.nodeName.substring(s+1);xO.indexOf(a)!==-1&&(i.nodeName=i.nodeName.substring(0,s),i.objectName=a)}if(i.propertyName===null||i.propertyName.length===0)throw new Error("PropertyBinding: can not parse propertyName from trackName: "+t);return i}static findNode(t,n){if(n===void 0||n===""||n==="."||n===-1||n===t.name||n===t.uuid)return t;if(t.skeleton){let i=t.skeleton.getBoneByName(n);if(i!==void 0)return i}if(t.children){let i=function(a){for(let r=0;r<a.length;r++){let o=a[r];if(o.name===n||o.uuid===n)return o;let l=i(o.children);if(l)return l}return null},s=i(t.children);if(s)return s}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,n){t[n]=this.targetObject[this.propertyName]}_getValue_array(t,n){let i=this.resolvedProperty;for(let s=0,a=i.length;s!==a;++s)t[n++]=i[s]}_getValue_arrayElement(t,n){t[n]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,n){this.resolvedProperty.toArray(t,n)}_setValue_direct(t,n){this.targetObject[this.propertyName]=t[n]}_setValue_direct_setNeedsUpdate(t,n){this.targetObject[this.propertyName]=t[n],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,n){this.targetObject[this.propertyName]=t[n],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,n){let i=this.resolvedProperty;for(let s=0,a=i.length;s!==a;++s)i[s]=t[n++]}_setValue_array_setNeedsUpdate(t,n){let i=this.resolvedProperty;for(let s=0,a=i.length;s!==a;++s)i[s]=t[n++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,n){let i=this.resolvedProperty;for(let s=0,a=i.length;s!==a;++s)i[s]=t[n++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,n){this.resolvedProperty[this.propertyIndex]=t[n]}_setValue_arrayElement_setNeedsUpdate(t,n){this.resolvedProperty[this.propertyIndex]=t[n],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,n){this.resolvedProperty[this.propertyIndex]=t[n],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,n){this.resolvedProperty.fromArray(t,n)}_setValue_fromArray_setNeedsUpdate(t,n){this.resolvedProperty.fromArray(t,n),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,n){this.resolvedProperty.fromArray(t,n),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,n){this.bind(),this.getValue(t,n)}_setValue_unbound(t,n){this.bind(),this.setValue(t,n)}bind(){let t=this.node,n=this.parsedPath,i=n.objectName,s=n.propertyName,a=n.propertyIndex;if(t||(t=e.findNode(this.rootNode,n.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){console.warn("THREE.PropertyBinding: No target node found for track: "+this.path+".");return}if(i){let c=n.objectIndex;switch(i){case"materials":if(!t.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let u=0;u<t.length;u++)if(t[u].name===c){c=u;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){console.error("THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[i]===void 0){console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[i]}if(c!==void 0){if(t[c]===void 0){console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[c]}}let r=t[s];if(r===void 0){let c=n.nodeName;console.error("THREE.PropertyBinding: Trying to update property for track: "+c+"."+s+" but it wasn't found.",t);return}let o=this.Versioning.None;this.targetObject=t,t.needsUpdate!==void 0?o=this.Versioning.NeedsUpdate:t.matrixWorldNeedsUpdate!==void 0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(a!==void 0){if(s==="morphTargetInfluences"){if(!t.geometry){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[a]!==void 0&&(a=t.morphTargetDictionary[a])}l=this.BindingType.ArrayElement,this.resolvedProperty=r,this.propertyIndex=a}else r.fromArray!==void 0&&r.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=r):Array.isArray(r)?(l=this.BindingType.EntireArray,this.resolvedProperty=r):this.propertyName=s;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};on.Composite=ly;on.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};on.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};on.prototype.GetterByBindingType=[on.prototype._getValue_direct,on.prototype._getValue_array,on.prototype._getValue_arrayElement,on.prototype._getValue_toArray];on.prototype.SetterByBindingTypeAndVersioning=[[on.prototype._setValue_direct,on.prototype._setValue_direct_setNeedsUpdate,on.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[on.prototype._setValue_array,on.prototype._setValue_array_setNeedsUpdate,on.prototype._setValue_array_setMatrixWorldNeedsUpdate],[on.prototype._setValue_arrayElement,on.prototype._setValue_arrayElement_setNeedsUpdate,on.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[on.prototype._setValue_fromArray,on.prototype._setValue_fromArray_setNeedsUpdate,on.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];bI=new Float32Array(1),zu=class{constructor(t=1,n=0,i=0){return this.radius=t,this.phi=n,this.theta=i,this}set(t,n,i){return this.radius=t,this.phi=n,this.theta=i,this}copy(t){return this.radius=t.radius,this.phi=t.phi,this.theta=t.theta,this}makeSafe(){return this.phi=Math.max(1e-6,Math.min(Math.PI-1e-6,this.phi)),this}setFromVector3(t){return this.setFromCartesianCoords(t.x,t.y,t.z)}setFromCartesianCoords(t,n,i){return this.radius=Math.sqrt(t*t+n*n+i*i),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(t,i),this.phi=Math.acos(ni(n/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}},Fd=class extends Ra{constructor(t,n=null){super(),this.object=t,this.domElement=n,this.enabled=!0,this.state=-1,this.keys={},this.mouseButtons={LEFT:null,MIDDLE:null,RIGHT:null},this.touches={ONE:null,TWO:null}}connect(){}disconnect(){}dispose(){}update(){}};typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"169"}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="169")});function SO(e){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(e.pointerId),this.domElement.addEventListener("pointermove",this._onPointerMove),this.domElement.addEventListener("pointerup",this._onPointerUp)),!this._isTrackingPointer(e)&&(this._addPointer(e),e.pointerType==="touch"?this._onTouchStart(e):this._onMouseDown(e)))}function MO(e){this.enabled!==!1&&(e.pointerType==="touch"?this._onTouchMove(e):this._onMouseMove(e))}function EO(e){switch(this._removePointer(e),this._pointers.length){case 0:this.domElement.releasePointerCapture(e.pointerId),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.dispatchEvent(gT),this.state=Ye.NONE;break;case 1:let t=this._pointers[0],n=this._pointerPositions[t];this._onTouchStart({pointerId:t,pageX:n.x,pageY:n.y});break}}function TO(e){let t;switch(e.button){case 0:t=this.mouseButtons.LEFT;break;case 1:t=this.mouseButtons.MIDDLE;break;case 2:t=this.mouseButtons.RIGHT;break;default:t=-1}switch(t){case vo.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(e),this.state=Ye.DOLLY;break;case vo.ROTATE:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=Ye.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=Ye.ROTATE}break;case vo.PAN:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=Ye.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=Ye.PAN}break;default:this.state=Ye.NONE}this.state!==Ye.NONE&&this.dispatchEvent(by)}function AO(e){switch(this.state){case Ye.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(e);break;case Ye.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(e);break;case Ye.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(e);break}}function wO(e){this.enabled===!1||this.enableZoom===!1||this.state!==Ye.NONE||(e.preventDefault(),this.dispatchEvent(by),this._handleMouseWheel(this._customWheelEvent(e)),this.dispatchEvent(gT))}function RO(e){this.enabled===!1||this.enablePan===!1||this._handleKeyDown(e)}function CO(e){switch(this._trackPointer(e),this._pointers.length){case 1:switch(this.touches.ONE){case yo.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(e),this.state=Ye.TOUCH_ROTATE;break;case yo.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(e),this.state=Ye.TOUCH_PAN;break;default:this.state=Ye.NONE}break;case 2:switch(this.touches.TWO){case yo.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(e),this.state=Ye.TOUCH_DOLLY_PAN;break;case yo.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(e),this.state=Ye.TOUCH_DOLLY_ROTATE;break;default:this.state=Ye.NONE}break;default:this.state=Ye.NONE}this.state!==Ye.NONE&&this.dispatchEvent(by)}function DO(e){switch(this._trackPointer(e),this.state){case Ye.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(e),this.update();break;case Ye.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(e),this.update();break;case Ye.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(e),this.update();break;case Ye.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(e),this.update();break;default:this.state=Ye.NONE}}function NO(e){this.enabled!==!1&&e.preventDefault()}function UO(e){e.key==="Control"&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function LO(e){e.key==="Control"&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}var pT,by,gT,kd,mT,bO,Dn,Ai,Ye,xy,Xd,vT=gn(()=>{Qs();pT={type:"change"},by={type:"start"},gT={type:"end"},kd=new ic,mT=new ys,bO=Math.cos(70*sT.DEG2RAD),Dn=new W,Ai=2*Math.PI,Ye={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},xy=1e-6,Xd=class extends Fd{constructor(t,n=null){super(t,n),this.state=Ye.NONE,this.enabled=!0,this.target=new W,this.cursor=new W,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:vo.ROTATE,MIDDLE:vo.DOLLY,RIGHT:vo.PAN},this.touches={ONE:yo.ROTATE,TWO:yo.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._domElementKeyEvents=null,this._lastPosition=new W,this._lastQuaternion=new Ss,this._lastTargetPosition=new W,this._quat=new Ss().setFromUnitVectors(t.up,new W(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new zu,this._sphericalDelta=new zu,this._scale=1,this._panOffset=new W,this._rotateStart=new Yt,this._rotateEnd=new Yt,this._rotateDelta=new Yt,this._panStart=new Yt,this._panEnd=new Yt,this._panDelta=new Yt,this._dollyStart=new Yt,this._dollyEnd=new Yt,this._dollyDelta=new Yt,this._dollyDirection=new W,this._mouse=new Yt,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=MO.bind(this),this._onPointerDown=SO.bind(this),this._onPointerUp=EO.bind(this),this._onContextMenu=NO.bind(this),this._onMouseWheel=wO.bind(this),this._onKeyDown=RO.bind(this),this._onTouchStart=CO.bind(this),this._onTouchMove=DO.bind(this),this._onMouseDown=TO.bind(this),this._onMouseMove=AO.bind(this),this._interceptControlDown=UO.bind(this),this._interceptControlUp=LO.bind(this),this.domElement!==null&&this.connect(),this.update()}connect(){this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointercancel",this._onPointerUp),this.domElement.addEventListener("contextmenu",this._onContextMenu),this.domElement.addEventListener("wheel",this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener("keydown",this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction="none"}disconnect(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.domElement.removeEventListener("pointercancel",this._onPointerUp),this.domElement.removeEventListener("wheel",this._onMouseWheel),this.domElement.removeEventListener("contextmenu",this._onContextMenu),this.stopListenToKeyEvents(),this.domElement.getRootNode().removeEventListener("keydown",this._interceptControlDown,{capture:!0}),this.domElement.style.touchAction="auto"}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(t){t.addEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=t}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(pT),this.update(),this.state=Ye.NONE}update(t=null){let n=this.object.position;Dn.copy(n).sub(this.target),Dn.applyQuaternion(this._quat),this._spherical.setFromVector3(Dn),this.autoRotate&&this.state===Ye.NONE&&this._rotateLeft(this._getAutoRotationAngle(t)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let i=this.minAzimuthAngle,s=this.maxAzimuthAngle;isFinite(i)&&isFinite(s)&&(i<-Math.PI?i+=Ai:i>Math.PI&&(i-=Ai),s<-Math.PI?s+=Ai:s>Math.PI&&(s-=Ai),i<=s?this._spherical.theta=Math.max(i,Math.min(s,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(i+s)/2?Math.max(i,this._spherical.theta):Math.min(s,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let a=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{let r=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),a=r!=this._spherical.radius}if(Dn.setFromSpherical(this._spherical),Dn.applyQuaternion(this._quatInverse),n.copy(this.target).add(Dn),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let r=null;if(this.object.isPerspectiveCamera){let o=Dn.length();r=this._clampDistance(o*this._scale);let l=o-r;this.object.position.addScaledVector(this._dollyDirection,l),this.object.updateMatrixWorld(),a=!!l}else if(this.object.isOrthographicCamera){let o=new W(this._mouse.x,this._mouse.y,0);o.unproject(this.object);let l=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),a=l!==this.object.zoom;let c=new W(this._mouse.x,this._mouse.y,0);c.unproject(this.object),this.object.position.sub(c).add(o),this.object.updateMatrixWorld(),r=Dn.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),this.zoomToCursor=!1;r!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(r).add(this.object.position):(kd.origin.copy(this.object.position),kd.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(kd.direction))<bO?this.object.lookAt(this.target):(mT.setFromNormalAndCoplanarPoint(this.object.up,this.target),kd.intersectPlane(mT,this.target))))}else if(this.object.isOrthographicCamera){let r=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),r!==this.object.zoom&&(this.object.updateProjectionMatrix(),a=!0)}return this._scale=1,this._performCursorZoom=!1,a||this._lastPosition.distanceToSquared(this.object.position)>xy||8*(1-this._lastQuaternion.dot(this.object.quaternion))>xy||this._lastTargetPosition.distanceToSquared(this.target)>xy?(this.dispatchEvent(pT),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(t){return t!==null?Ai/60*this.autoRotateSpeed*t:Ai/60/60*this.autoRotateSpeed}_getZoomScale(t){let n=Math.abs(t*.01);return Math.pow(.95,this.zoomSpeed*n)}_rotateLeft(t){this._sphericalDelta.theta-=t}_rotateUp(t){this._sphericalDelta.phi-=t}_panLeft(t,n){Dn.setFromMatrixColumn(n,0),Dn.multiplyScalar(-t),this._panOffset.add(Dn)}_panUp(t,n){this.screenSpacePanning===!0?Dn.setFromMatrixColumn(n,1):(Dn.setFromMatrixColumn(n,0),Dn.crossVectors(this.object.up,Dn)),Dn.multiplyScalar(t),this._panOffset.add(Dn)}_pan(t,n){let i=this.domElement;if(this.object.isPerspectiveCamera){let s=this.object.position;Dn.copy(s).sub(this.target);let a=Dn.length();a*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*t*a/i.clientHeight,this.object.matrix),this._panUp(2*n*a/i.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(t*(this.object.right-this.object.left)/this.object.zoom/i.clientWidth,this.object.matrix),this._panUp(n*(this.object.top-this.object.bottom)/this.object.zoom/i.clientHeight,this.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),this.enablePan=!1)}_dollyOut(t){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=t:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_dollyIn(t){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=t:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_updateZoomParameters(t,n){if(!this.zoomToCursor)return;this._performCursorZoom=!0;let i=this.domElement.getBoundingClientRect(),s=t-i.left,a=n-i.top,r=i.width,o=i.height;this._mouse.x=s/r*2-1,this._mouse.y=-(a/o)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(t){return Math.max(this.minDistance,Math.min(this.maxDistance,t))}_handleMouseDownRotate(t){this._rotateStart.set(t.clientX,t.clientY)}_handleMouseDownDolly(t){this._updateZoomParameters(t.clientX,t.clientX),this._dollyStart.set(t.clientX,t.clientY)}_handleMouseDownPan(t){this._panStart.set(t.clientX,t.clientY)}_handleMouseMoveRotate(t){this._rotateEnd.set(t.clientX,t.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let n=this.domElement;this._rotateLeft(Ai*this._rotateDelta.x/n.clientHeight),this._rotateUp(Ai*this._rotateDelta.y/n.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(t){this._dollyEnd.set(t.clientX,t.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(t){this._panEnd.set(t.clientX,t.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(t){this._updateZoomParameters(t.clientX,t.clientY),t.deltaY<0?this._dollyIn(this._getZoomScale(t.deltaY)):t.deltaY>0&&this._dollyOut(this._getZoomScale(t.deltaY)),this.update()}_handleKeyDown(t){let n=!1;switch(t.code){case this.keys.UP:t.ctrlKey||t.metaKey||t.shiftKey?this._rotateUp(Ai*this.rotateSpeed/this.domElement.clientHeight):this._pan(0,this.keyPanSpeed),n=!0;break;case this.keys.BOTTOM:t.ctrlKey||t.metaKey||t.shiftKey?this._rotateUp(-Ai*this.rotateSpeed/this.domElement.clientHeight):this._pan(0,-this.keyPanSpeed),n=!0;break;case this.keys.LEFT:t.ctrlKey||t.metaKey||t.shiftKey?this._rotateLeft(Ai*this.rotateSpeed/this.domElement.clientHeight):this._pan(this.keyPanSpeed,0),n=!0;break;case this.keys.RIGHT:t.ctrlKey||t.metaKey||t.shiftKey?this._rotateLeft(-Ai*this.rotateSpeed/this.domElement.clientHeight):this._pan(-this.keyPanSpeed,0),n=!0;break}n&&(t.preventDefault(),this.update())}_handleTouchStartRotate(t){if(this._pointers.length===1)this._rotateStart.set(t.pageX,t.pageY);else{let n=this._getSecondPointerPosition(t),i=.5*(t.pageX+n.x),s=.5*(t.pageY+n.y);this._rotateStart.set(i,s)}}_handleTouchStartPan(t){if(this._pointers.length===1)this._panStart.set(t.pageX,t.pageY);else{let n=this._getSecondPointerPosition(t),i=.5*(t.pageX+n.x),s=.5*(t.pageY+n.y);this._panStart.set(i,s)}}_handleTouchStartDolly(t){let n=this._getSecondPointerPosition(t),i=t.pageX-n.x,s=t.pageY-n.y,a=Math.sqrt(i*i+s*s);this._dollyStart.set(0,a)}_handleTouchStartDollyPan(t){this.enableZoom&&this._handleTouchStartDolly(t),this.enablePan&&this._handleTouchStartPan(t)}_handleTouchStartDollyRotate(t){this.enableZoom&&this._handleTouchStartDolly(t),this.enableRotate&&this._handleTouchStartRotate(t)}_handleTouchMoveRotate(t){if(this._pointers.length==1)this._rotateEnd.set(t.pageX,t.pageY);else{let i=this._getSecondPointerPosition(t),s=.5*(t.pageX+i.x),a=.5*(t.pageY+i.y);this._rotateEnd.set(s,a)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let n=this.domElement;this._rotateLeft(Ai*this._rotateDelta.x/n.clientHeight),this._rotateUp(Ai*this._rotateDelta.y/n.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(t){if(this._pointers.length===1)this._panEnd.set(t.pageX,t.pageY);else{let n=this._getSecondPointerPosition(t),i=.5*(t.pageX+n.x),s=.5*(t.pageY+n.y);this._panEnd.set(i,s)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(t){let n=this._getSecondPointerPosition(t),i=t.pageX-n.x,s=t.pageY-n.y,a=Math.sqrt(i*i+s*s);this._dollyEnd.set(0,a),this._dollyDelta.set(0,Math.pow(this._dollyEnd.y/this._dollyStart.y,this.zoomSpeed)),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);let r=(t.pageX+n.x)*.5,o=(t.pageY+n.y)*.5;this._updateZoomParameters(r,o)}_handleTouchMoveDollyPan(t){this.enableZoom&&this._handleTouchMoveDolly(t),this.enablePan&&this._handleTouchMovePan(t)}_handleTouchMoveDollyRotate(t){this.enableZoom&&this._handleTouchMoveDolly(t),this.enableRotate&&this._handleTouchMoveRotate(t)}_addPointer(t){this._pointers.push(t.pointerId)}_removePointer(t){delete this._pointerPositions[t.pointerId];for(let n=0;n<this._pointers.length;n++)if(this._pointers[n]==t.pointerId){this._pointers.splice(n,1);return}}_isTrackingPointer(t){for(let n=0;n<this._pointers.length;n++)if(this._pointers[n]==t.pointerId)return!0;return!1}_trackPointer(t){let n=this._pointerPositions[t.pointerId];n===void 0&&(n=new Yt,this._pointerPositions[t.pointerId]=n),n.set(t.pageX,t.pageY)}_getSecondPointerPosition(t){let n=t.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[n]}_customWheelEvent(t){let n=t.deltaMode,i={clientX:t.clientX,clientY:t.clientY,deltaY:t.deltaY};switch(n){case 1:i.deltaY*=16;break;case 2:i.deltaY*=100;break}return t.ctrlKey&&!this._controlActive&&(i.deltaY*=10),i}}});var Wd,Sy=gn(()=>{Wd={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`}});var Ts,OO,My,IO,uc,Fu=gn(()=>{Qs();Ts=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}},OO=new Pu(-1,1,1,-1,0,1),My=class extends En{constructor(){super(),this.setAttribute("position",new ai([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new ai([0,2,0,0,2,0],2))}},IO=new My,uc=class{constructor(t){this._mesh=new si(IO,t)}dispose(){this._mesh.geometry.dispose()}render(t){t.render(this._mesh,OO)}get material(){return this._mesh.material}set material(t){this._mesh.material=t}}});var hc,Ey=gn(()=>{Qs();Fu();hc=class extends Ts{constructor(t,n){super(),this.textureID=n!==void 0?n:"tDiffuse",t instanceof un?(this.uniforms=t.uniforms,this.material=t):t&&(this.uniforms=lc.clone(t.uniforms),this.material=new un({name:t.name!==void 0?t.name:"unspecified",defines:Object.assign({},t.defines),uniforms:this.uniforms,vertexShader:t.vertexShader,fragmentShader:t.fragmentShader})),this.fsQuad=new uc(this.material)}render(t,n,i){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=i.texture),this.fsQuad.material=this.material,this.renderToScreen?(t.setRenderTarget(null),this.fsQuad.render(t)):(t.setRenderTarget(n),this.clear&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),this.fsQuad.render(t))}dispose(){this.material.dispose(),this.fsQuad.dispose()}}});var Hu,qd,Ty=gn(()=>{Fu();Hu=class extends Ts{constructor(t,n){super(),this.scene=t,this.camera=n,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(t,n,i){let s=t.getContext(),a=t.state;a.buffers.color.setMask(!1),a.buffers.depth.setMask(!1),a.buffers.color.setLocked(!0),a.buffers.depth.setLocked(!0);let r,o;this.inverse?(r=0,o=1):(r=1,o=0),a.buffers.stencil.setTest(!0),a.buffers.stencil.setOp(s.REPLACE,s.REPLACE,s.REPLACE),a.buffers.stencil.setFunc(s.ALWAYS,r,4294967295),a.buffers.stencil.setClear(o),a.buffers.stencil.setLocked(!0),t.setRenderTarget(i),this.clear&&t.clear(),t.render(this.scene,this.camera),t.setRenderTarget(n),this.clear&&t.clear(),t.render(this.scene,this.camera),a.buffers.color.setLocked(!1),a.buffers.depth.setLocked(!1),a.buffers.color.setMask(!0),a.buffers.depth.setMask(!0),a.buffers.stencil.setLocked(!1),a.buffers.stencil.setFunc(s.EQUAL,1,4294967295),a.buffers.stencil.setOp(s.KEEP,s.KEEP,s.KEEP),a.buffers.stencil.setLocked(!0)}},qd=class extends Ts{constructor(){super(),this.needsSwap=!1}render(t){t.state.buffers.stencil.setLocked(!1),t.state.buffers.stencil.setTest(!1)}}});var Yd,yT=gn(()=>{Qs();Sy();Ey();Ty();Ty();Yd=class{constructor(t,n){if(this.renderer=t,this._pixelRatio=t.getPixelRatio(),n===void 0){let i=t.getSize(new Yt);this._width=i.width,this._height=i.height,n=new Zn(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:Es}),n.texture.name="EffectComposer.rt1"}else this._width=n.width,this._height=n.height;this.renderTarget1=n,this.renderTarget2=n.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new hc(Wd),this.copyPass.material.blending=qs,this.clock=new Bd}swapBuffers(){let t=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=t}addPass(t){this.passes.push(t),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(t,n){this.passes.splice(n,0,t),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(t){let n=this.passes.indexOf(t);n!==-1&&this.passes.splice(n,1)}isLastEnabledPass(t){for(let n=t+1;n<this.passes.length;n++)if(this.passes[n].enabled)return!1;return!0}render(t){t===void 0&&(t=this.clock.getDelta());let n=this.renderer.getRenderTarget(),i=!1;for(let s=0,a=this.passes.length;s<a;s++){let r=this.passes[s];if(r.enabled!==!1){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(s),r.render(this.renderer,this.writeBuffer,this.readBuffer,t,i),r.needsSwap){if(i){let o=this.renderer.getContext(),l=this.renderer.state.buffers.stencil;l.setFunc(o.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,t),l.setFunc(o.EQUAL,1,4294967295)}this.swapBuffers()}Hu!==void 0&&(r instanceof Hu?i=!0:r instanceof qd&&(i=!1))}}this.renderer.setRenderTarget(n)}reset(t){if(t===void 0){let n=this.renderer.getSize(new Yt);this._pixelRatio=this.renderer.getPixelRatio(),this._width=n.width,this._height=n.height,t=this.renderTarget1.clone(),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=t,this.renderTarget2=t.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(t,n){this._width=t,this._height=n;let i=this._width*this._pixelRatio,s=this._height*this._pixelRatio;this.renderTarget1.setSize(i,s),this.renderTarget2.setSize(i,s);for(let a=0;a<this.passes.length;a++)this.passes[a].setSize(i,s)}setPixelRatio(t){this._pixelRatio=t,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}}});var Zd,_T=gn(()=>{Qs();Fu();Zd=class extends Ts{constructor(t,n,i=null,s=null,a=null){super(),this.scene=t,this.camera=n,this.overrideMaterial=i,this.clearColor=s,this.clearAlpha=a,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this._oldClearColor=new fe}render(t,n,i){let s=t.autoClear;t.autoClear=!1;let a,r;this.overrideMaterial!==null&&(r=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(t.getClearColor(this._oldClearColor),t.setClearColor(this.clearColor,t.getClearAlpha())),this.clearAlpha!==null&&(a=t.getClearAlpha(),t.setClearAlpha(this.clearAlpha)),this.clearDepth==!0&&t.clearDepth(),t.setRenderTarget(this.renderToScreen?null:i),this.clear===!0&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),t.render(this.scene,this.camera),this.clearColor!==null&&t.setClearColor(this._oldClearColor),this.clearAlpha!==null&&t.setClearAlpha(a),this.overrideMaterial!==null&&(this.scene.overrideMaterial=r),t.autoClear=s}}});var xT,bT=gn(()=>{Qs();xT={name:"LuminosityHighPassShader",shaderID:"luminosityHighPass",uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new fe(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`}});var fc,ST=gn(()=>{Qs();Fu();Sy();bT();fc=class e extends Ts{constructor(t,n,i,s){super(),this.strength=n!==void 0?n:1,this.radius=i,this.threshold=s,this.resolution=t!==void 0?new Yt(t.x,t.y):new Yt(256,256),this.clearColor=new fe(0,0,0),this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let a=Math.round(this.resolution.x/2),r=Math.round(this.resolution.y/2);this.renderTargetBright=new Zn(a,r,{type:Es}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let d=0;d<this.nMips;d++){let h=new Zn(a,r,{type:Es});h.texture.name="UnrealBloomPass.h"+d,h.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(h);let p=new Zn(a,r,{type:Es});p.texture.name="UnrealBloomPass.v"+d,p.texture.generateMipmaps=!1,this.renderTargetsVertical.push(p),a=Math.round(a/2),r=Math.round(r/2)}let o=xT;this.highPassUniforms=lc.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=s,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new un({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];let l=[3,5,7,9,11];a=Math.round(this.resolution.x/2),r=Math.round(this.resolution.y/2);for(let d=0;d<this.nMips;d++)this.separableBlurMaterials.push(this.getSeperableBlurMaterial(l[d])),this.separableBlurMaterials[d].uniforms.invSize.value=new Yt(1/a,1/r),a=Math.round(a/2),r=Math.round(r/2);this.compositeMaterial=this.getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=n,this.compositeMaterial.uniforms.bloomRadius.value=.1;let c=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=c,this.bloomTintColors=[new W(1,1,1),new W(1,1,1),new W(1,1,1),new W(1,1,1),new W(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors;let u=Wd;this.copyUniforms=lc.clone(u.uniforms),this.blendMaterial=new un({uniforms:this.copyUniforms,vertexShader:u.vertexShader,fragmentShader:u.fragmentShader,blending:wa,depthTest:!1,depthWrite:!1,transparent:!0}),this.enabled=!0,this.needsSwap=!1,this._oldClearColor=new fe,this.oldClearAlpha=1,this.basic=new Da,this.fsQuad=new uc(null)}dispose(){for(let t=0;t<this.renderTargetsHorizontal.length;t++)this.renderTargetsHorizontal[t].dispose();for(let t=0;t<this.renderTargetsVertical.length;t++)this.renderTargetsVertical[t].dispose();this.renderTargetBright.dispose();for(let t=0;t<this.separableBlurMaterials.length;t++)this.separableBlurMaterials[t].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this.basic.dispose(),this.fsQuad.dispose()}setSize(t,n){let i=Math.round(t/2),s=Math.round(n/2);this.renderTargetBright.setSize(i,s);for(let a=0;a<this.nMips;a++)this.renderTargetsHorizontal[a].setSize(i,s),this.renderTargetsVertical[a].setSize(i,s),this.separableBlurMaterials[a].uniforms.invSize.value=new Yt(1/i,1/s),i=Math.round(i/2),s=Math.round(s/2)}render(t,n,i,s,a){t.getClearColor(this._oldClearColor),this.oldClearAlpha=t.getClearAlpha();let r=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this.fsQuad.material=this.basic,this.basic.map=i.texture,t.setRenderTarget(null),t.clear(),this.fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=i.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this.fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this.fsQuad.render(t);let o=this.renderTargetBright;for(let l=0;l<this.nMips;l++)this.fsQuad.material=this.separableBlurMaterials[l],this.separableBlurMaterials[l].uniforms.colorTexture.value=o.texture,this.separableBlurMaterials[l].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[l]),t.clear(),this.fsQuad.render(t),this.separableBlurMaterials[l].uniforms.colorTexture.value=this.renderTargetsHorizontal[l].texture,this.separableBlurMaterials[l].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[l]),t.clear(),this.fsQuad.render(t),o=this.renderTargetsVertical[l];this.fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this.fsQuad.render(t),this.fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this.fsQuad.render(t)):(t.setRenderTarget(i),this.fsQuad.render(t)),t.setClearColor(this._oldClearColor,this.oldClearAlpha),t.autoClear=r}getSeperableBlurMaterial(t){let n=[];for(let i=0;i<t;i++)n.push(.39894*Math.exp(-.5*i*i/(t*t))/t);return new un({defines:{KERNEL_RADIUS:t},uniforms:{colorTexture:{value:null},invSize:{value:new Yt(.5,.5)},direction:{value:new Yt(.5,.5)},gaussianCoefficients:{value:n}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float gaussianCoefficients[KERNEL_RADIUS];

				void main() {
					float weightSum = gaussianCoefficients[0];
					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {
						float x = float(i);
						float w = gaussianCoefficients[i];
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += (sample1 + sample2) * w;
						weightSum += 2.0 * w;
					}
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
				}`})}getCompositeMaterial(t){return new un({defines:{NUM_MIPS:t},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`varying vec2 vUv;
				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor(const in float factor) {
					float mirrorFactor = 1.2 - factor;
					return mix(factor, mirrorFactor, bloomRadius);
				}

				void main() {
					gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
						lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
						lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
						lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
						lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
				}`})}};fc.BlurDirectionX=new Yt(1,0);fc.BlurDirectionY=new Yt(0,1)});function AT(e){return(0,MT.useSyncExternalStore)(t=>(Ay.add(t),()=>Ay.delete(t)),()=>e(ET))}var MT,ET,Ay,TT,wy=gn(()=>{MT=Uo(Io()),ET={activeThemeId:"noteflow-dark"},Ay=new Set,TT=e=>{ET={activeThemeId:e},Ay.forEach(t=>t())}});function wT(e){let t=e.trim().replace("#",""),n=t.length===3?`${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`:t,i=parseInt(n.slice(0,6),16);return Number.isNaN(i)?[0,0,0]:[i>>16&255,i>>8&255,i&255]}var Ry=gn(()=>{});function RT(e){return PO.test(e)}var PO,CT=gn(()=>{Ry();PO=/^#[0-9a-f]{6}$/i});function zO(e){return RT(e)?wT(e):dc(e)}function dc(e){let n=getComputedStyle(document.documentElement).getPropertyValue(e).trim().split(/[\s,]+/).map(Number);return n.length>=3&&n.every(i=>!Number.isNaN(i))?[n[0],n[1],n[2]]:[128,128,128]}function BO(){let e=new Map,t=n=>{let i=e.get(n);return i||(i=zO(n),e.set(n,i)),i};return{bg:dc("--bg-editor"),panel:dc("--bg-1"),text:dc("--text"),textMuted:dc("--text-muted"),border:dc("--border"),color:t}}function DT(){return BO()}var NT=gn(()=>{Ry();CT()});function xo(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let n=t;return n=Math.imul(n^n>>>15,n|1),n^=n+Math.imul(n^n>>>7,n|61),((n^n>>>14)>>>0)/4294967296}}function VO(){let e=(1+Math.sqrt(5))/2;return{verts:[[-1,e,0],[1,e,0],[-1,-e,0],[1,-e,0],[0,-1,e],[0,1,e],[0,-1,-e],[0,1,-e],[e,0,-1],[e,0,1],[-e,0,-1],[-e,0,1]].map(_o),faces:[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]]}}function GO(e){let t=VO(),n=t.verts.slice(),i=new Map,s=(r,o)=>{let l=r<o?r*65536+o:o*65536+r,c=i.get(l);if(c!==void 0)return c;let u=n[r],d=n[o];return n.push(_o([(u[0]+d[0])/2,(u[1]+d[1])/2,(u[2]+d[2])/2])),i.set(l,n.length-1),n.length-1},a=t.faces;for(let r=0;r<e;r++){let o=[];for(let l of a){let c=s(l[0],l[1]),u=s(l[1],l[2]),d=s(l[2],l[0]);o.push([l[0],c,d],[l[1],u,c],[l[2],d,u],[c,u,d])}a=o}return{verts:n,faces:a}}function jd(e){let t=e.length,n=new Float64Array(t),i=new Float64Array(t),s=new Float64Array(t);for(let r=0;r<t;r++)n[r]=e[r][0],i[r]=e[r][1];for(let r=0;r<t;r++){let o=r>0?(i[r]-i[r-1])/(n[r]-n[r-1]):null,l=r<t-1?(i[r+1]-i[r])/(n[r+1]-n[r]):null;s[r]=o==null?l??0:l==null?o:o*l<=0?0:(o+l)/2}let a=0;return r=>{if(r<=n[0])return i[0];if(r>=n[t-1])return i[t-1];for(;r>n[a+1];)a++;for(;r<=n[a];)a--;let o=n[a+1]-n[a],l=(r-n[a])/o,c=l*l,u=c*l;return(2*u-3*c+1)*i[a]+(u-2*c+l)*o*s[a]+(-2*u+3*c)*i[a+1]+(u-c)*o*s[a+1]}}function UT(e,t,n){if(n<=kO||n>=XO)return!1;let i=Ly(n);if(i<=1e-4)return!1;let s=gi(-.6,-.3,n)*(1-gi(.42,.6,n));if(s>0){let d=(t-Oy(n))/.06;i*=1-.045*Math.exp(-d*d)*s}let a=Math.abs(e)/i;if(a>=1)return!1;let r=WO(n),o=qO(n),l=o+.4*(r-o);if(t>=l)return t<l+(r-l)*Math.pow(1-Math.pow(a,2.3),1/2.3);let c=YO(n),u=c+(o-c)*gi(.2,.5,a);return t>l-(l-u)*Math.pow(1-Math.pow(a,2.8),1/2.8)}function zT(e){let t=1/Math.sqrt((e[0]/.97)**2+(e[1]/.86)**2+(e[2]/1.2)**2)+.06;for(;t>.04&&!UT(Js[0]+e[0]*t,Js[1]+e[1]*t,Js[2]+e[2]*t);)t-=.025;let n=t,i=t+.025;for(let s=0;s<10;s++){let a=(n+i)/2;UT(Js[0]+e[0]*a,Js[1]+e[1]*a,Js[2]+e[2]*a)?n=a:i=a}return n}function Gu(e,t,n){let s=(Math.abs(e)+.05*Math.sin(n*3.1+(e>0?0:1.9)))*Cy,a=t*Cy,r=n*Cy,o=Dy*Math.sin(r*.63+1.7),l=Dy*Math.sin(s*.63+4.1),c=Dy*Math.sin(a*.63+2.9);s+=o,a+=l,r+=c;let u=Math.sin(s)*Math.cos(a)+Math.sin(a)*Math.cos(r)+Math.sin(r)*Math.cos(s),d=Math.max(Ly(n),1e-4),h=Math.abs(e)/d,p=Oy(n),g=gi(p+.05,p+.16,t),S=gi(.35,.55,h),m=gi(-.55,-.3,n)*(1-gi(.5,.62,n)),f=Math.abs(n-PT(h)),y=t-p;return u=Vu(u,1,.85*g*OT(f,.085,.2)),u=Vu(u,1,.85*S*m*OT(-y,.075,.2)),u=Vu(u,-1.2,g*(1-gi(.03,.075,f))),u=Vu(u,-1.2,S*m*(1-gi(.03,.07,Math.abs(y)))),u=Vu(u,-1.2,1-gi(.035,.085,Math.abs(e))),u}function IT(e,t,n){let i=Math.abs(e)/Math.max(Ly(n),1e-4);return t<Oy(n)&&n<.66&&n>-.62&&i>.3?"temporal":n<-.74?"occipital":n>PT(i)?"frontal":"parietal"}function QO(){let e=[],t=[],n=[],i=[],s=new Map,a=[],r=[],o=[],l=[],c=0,u=(O,k,w,V,L,G)=>(e.push(O,k,w),t.push(HO[V]),n.push(L),i.push(G?1:0),c++),d=(O,k,w)=>{if(O===k)return;let V=Math.min(O,k),L=Math.max(O,k),G=V*8192+L,it=s.get(G);if(it!==void 0){w>o[it]&&(o[it]=w);return}s.set(G,a.length),a.push(V),r.push(L),o.push(w)},h=Js,p=GO(KO),g=p.verts.length,S=p.faces.length,m=0,f=Math.min(S,400);for(let O=0;O<f;O++){let k=p.verts[p.faces[O][0]],w=p.verts[p.faces[O][1]];m+=Math.acos(Math.max(-1,Math.min(1,k[0]*w[0]+k[1]*w[1]+k[2]*w[2])))}let y=m/f*.42,_=[],b=[],D=[],R=new Uint8Array(g);for(let O=0;O<g;O++){let k=LT(p.verts[O]),w=Kd(k),V=Gu(w[0],w[1],w[2]);for(let L=0;L<2;L++){let G=Math.abs(k[1])<.9?[0,1,0]:[1,0,0],it=_o([k[1]*G[2]-k[2]*G[1],k[2]*G[0]-k[0]*G[2],k[0]*G[1]-k[1]*G[0]]),lt=[k[1]*it[2]-k[2]*it[1],k[2]*it[0]-k[0]*it[2],k[0]*it[1]-k[1]*it[0]],Tt=.012,jt=Kd(_o([k[0]+Tt*it[0],k[1]+Tt*it[1],k[2]+Tt*it[2]])),Xt=Kd(_o([k[0]+Tt*lt[0],k[1]+Tt*lt[1],k[2]+Tt*lt[2]])),Ft=(Gu(jt[0],jt[1],jt[2])-V)/Tt,Wt=(Gu(Xt[0],Xt[1],Xt[2])-V)/Tt,Ee=Ft*Ft+Wt*Wt;if(Ee<1e-6)break;let Oe=(Tr-V)*Ft/Ee,Ie=(Tr-V)*Wt/Ee;if(Math.hypot(Oe,Ie)>y*(L===0?1:.5))break;k=_o([k[0]+Oe*it[0]+Ie*lt[0],k[1]+Oe*it[1]+Ie*lt[1],k[2]+Oe*it[2]+Ie*lt[2]]),R[O]=1,w=Kd(k),V=Gu(w[0],w[1],w[2])}b.push(k),_.push(w),D.push(V)}let A=new Uint8Array(S);for(let O=0;O<S;O++){let k=p.faces[O],w=_[k[0]],V=_[k[1]],L=_[k[2]];A[O]=Gu((w[0]+V[0]+L[0])/3,(w[1]+V[1]+L[1])/3,(w[2]+V[2]+L[2])/3)>Tr?1:0}let N=new Map,et=[],v=[],M=[],F=[],q=new Int32Array(S*3);for(let O=0;O<S;O++){let k=p.faces[O];for(let w=0;w<3;w++){let V=k[w],L=k[(w+1)%3],G=V<L?V:L,it=V<L?L:V,lt=G*8192+it,Tt=N.get(lt);Tt===void 0?(Tt=et.length,N.set(lt,Tt),et.push(G),v.push(it),M.push(O),F.push(-1)):F[Tt]=O,q[O*3+w]=Tt}}for(let O=0;O<2;O++){let k=A.slice();for(let w=0;w<S;w++){let V=0;for(let L=0;L<3;L++){let G=q[w*3+L],it=M[G]===w?F[G]:M[G];it>=0&&A[it]!==A[w]&&V++}V===3&&(k[w]=1-A[w])}A.set(k)}let K=[];for(let O=0;O<g;O++){let k=D[O],w=b[O],V=_[O],L=R[O]?-.004:k>Tr?.032*gi(Tr,Tr+.7,k):-.06*gi(Tr,Tr-.7,k);L-=.13*Math.exp(-Math.pow(V[0]/.07,2))*gi(-.3,.05,w[1]),K.push(u(V[0]+w[0]*L,V[1]+w[1]*L,V[2]+w[2]*L,IT(V[0],V[1],V[2]),0,!0))}let $=[];for(let O=0;O<g;O++)$.push(.22);for(let O=0;O<S;O++){let k=p.faces[O];if(l.push(k[0],k[1],k[2]),A[O])for(let w of k)$[w]<.5&&($[w]=.5)}for(let O=0;O<et.length;O++){let k=et[O],w=v[O],V=A[M[O]],L=F[O]>=0?A[F[O]]:V,G=b[k][1]<-.5&&b[w][1]<-.5?.6:1,it=(V!==L?1:V?.3:.045)*G;d(k,w,it),V!==L&&($[k]=Math.max($[k],G),$[w]=Math.max($[w],G))}let B=[];{let O=xo(439041101),k=Math.round(Math.min(2400,g*.65)),w=g+k,V=new Float64Array(w*3);for(let oe=0;oe<g;oe++){let Te=_[oe];V[oe*3]=Te[0],V[oe*3+1]=Te[1],V[oe*3+2]=Te[2]}for(let oe=0;oe<k;oe++){let Te=O()*2-1,Kn=O()*Math.PI*2,ri=Math.sqrt(1-Te*Te),wi=LT([ri*Math.cos(Kn),Te,ri*Math.sin(Kn)]),jn=zT(wi)*Math.cbrt(O())*.88,T=h[0]+wi[0]*jn,I=h[1]+wi[1]*jn,H=h[2]+wi[2]*jn,X=u(T,I,H,IT(T,I,H),0,!1);B.push(X),$.push(.6),V[X*3]=T,V[X*3+1]=I,V[X*3+2]=H}let L=.42,G=L*L,it=3,lt=L/it*1.000001,Tt=1/0,jt=1/0,Xt=1/0,Ft=-1/0,Wt=-1/0,Ee=-1/0;for(let oe=0;oe<w;oe++){let Te=V[oe*3],Kn=V[oe*3+1],ri=V[oe*3+2];Te<Tt&&(Tt=Te),Te>Ft&&(Ft=Te),Kn<jt&&(jt=Kn),Kn>Wt&&(Wt=Kn),ri<Xt&&(Xt=ri),ri>Ee&&(Ee=ri)}let Oe=Math.floor((Ft-Tt)/lt)+1,Ie=Math.floor((Wt-jt)/lt)+1,ln=Math.floor((Ee-Xt)/lt)+1,ki=new Int32Array(w),ws=new Int32Array(w),os=new Int32Array(w),vi=new Int32Array(Oe*Ie*ln+1),Ar=new Int32Array(w);for(let oe=0;oe<w;oe++)ki[oe]=Math.floor((V[oe*3]-Tt)/lt),ws[oe]=Math.floor((V[oe*3+1]-jt)/lt),os[oe]=Math.floor((V[oe*3+2]-Xt)/lt),vi[(ki[oe]*Ie+ws[oe])*ln+os[oe]+1]++;for(let oe=0;oe<Oe*Ie*ln;oe++)vi[oe+1]+=vi[oe];{let oe=vi.slice(0,Oe*Ie*ln);for(let Te=0;Te<w;Te++)Ar[oe[(ki[Te]*Ie+ws[Te])*ln+os[Te]]++]=Te}for(let oe=0;oe<k;oe++){let Te=B[oe],Kn=V[Te*3],ri=V[Te*3+1],wi=V[Te*3+2],jn=ki[Te],T=ws[Te],I=os[Te],H=-1,X=-1,z=-1,pt=1/0,Ct=1/0,Pt=1/0;for(let At=0;At<=it;At++){let Qt=Math.max(0,jn-At),qt=Math.min(Oe-1,jn+At),kt=Math.max(0,T-At),De=Math.min(Ie-1,T+At),Be=Math.max(0,I-At),Fe=Math.min(ln-1,I+At);for(let ae=Qt;ae<=qt;ae++)for(let Gt=kt;Gt<=De;Gt++){let Xe=Math.abs(ae-jn)===At||Math.abs(Gt-T)===At;for(let Ae=Be;Ae<=Fe;Ae++){if(!Xe&&Math.abs(Ae-I)!==At)continue;let Hn=(ae*Ie+Gt)*ln+Ae;for(let ge=vi[Hn],Un=vi[Hn+1];ge<Un;ge++){let hn=Ar[ge];if(hn===Te)continue;let pe=(Kn-V[hn*3])**2+(ri-V[hn*3+1])**2+(wi-V[hn*3+2])**2;pe>G||pe>Pt||pe===Pt&&hn>z||(pe<Ct||pe===Ct&&hn<X?(Pt=Ct,z=X,pe<pt||pe===pt&&hn<H?(Ct=pt,X=H,pt=pe,H=hn):(Ct=pe,X=hn)):(Pt=pe,z=hn))}}}let en=At*lt*.999999;if(z>=0&&Pt<en*en)break}if(H>=0)d(Te,H,.3),X>=0&&d(Te,X,.3),z>=0&&d(Te,z,.3);else{let At=-1,Qt=1/0;for(let qt=0;qt<w;qt++){if(qt===Te)continue;let kt=(Kn-V[qt*3])**2+(ri-V[qt*3+1])**2+(wi-V[qt*3+2])**2;kt<Qt&&(Qt=kt,At=qt)}At>=0&&d(Te,At,.3)}}}let ct=[];{let O=[0,-.31,-.7],k=[.4*Uy,.235,.33],w=12,V=18,L=(Tt,jt)=>{let Xt=Math.PI*Tt/w,Ft=Math.PI*2*(jt+Tt%2*.5)/V,Wt=[Math.sin(Xt)*Math.cos(Ft),Math.cos(Xt),Math.sin(Xt)*Math.sin(Ft)],Ee=(1-.3*Math.exp(-Math.pow(Wt[0]/.22,2))*(.55-.45*Wt[2]))*(1+.1*Math.pow(Math.abs(Wt[0]),1.5)),Oe=Tt%2?1.025:.985;return u(O[0]+Wt[0]*k[0]*Ee*Oe,O[1]+Wt[1]*k[1]*(Wt[1]>0?.88:1)*(1-.22*Math.exp(-Math.pow(Wt[0]/.2,2))*Math.max(0,-Wt[1])),O[2]+Wt[2]*k[2]*Ee*Oe,"cerebellum",1,!0)},G=L(0,0);$.push(.6);let it=[];for(let Tt=1;Tt<w;Tt++){let jt=[];for(let Xt=0;Xt<V;Xt++)jt.push(L(Tt,Xt)),$.push(Tt%2?.9:.4);it.push(jt)}let lt=L(w,0);$.push(.4),ct.push(G,lt),it.forEach((Tt,jt)=>{for(let Xt=0;Xt<V;Xt++){let Ft=Tt[Xt],Wt=Tt[(Xt+1)%V];if(ct.push(Ft),d(Ft,Wt,(jt+1)%2?.95:.4),jt===0&&(l.push(G,Ft,Wt),d(G,Ft,.3)),jt<it.length-1){let Ee=it[jt+1],Oe=Ee[Xt],Ie=Ee[(Xt+1)%V];jt%2?(l.push(Ft,Oe,Wt,Wt,Oe,Ie),d(Ft,Oe,.3),d(Wt,Oe,.3)):(l.push(Ft,Oe,Ie,Ft,Ie,Wt),d(Ft,Oe,.3),d(Ft,Ie,.3))}else l.push(lt,Wt,Ft),d(lt,Ft,.2)}})}let Z=[],wt=9,mt=8;{let O=[0,0,-.1],k=[0,-.82,-.37],w=[];for(let V=0;V<wt;V++){let L=V/(wt-1),G=Math.exp(-Math.pow((L-.32)/.17,2)),it=.19*(1-L)+.09*L+.085*G,lt=O[0]+(k[0]-O[0])*L,Tt=O[1]+(k[1]-O[1])*L,jt=O[2]+(k[2]-O[2])*L+.05*G,Xt=[];for(let Ft=0;Ft<mt;Ft++){let Wt=Math.PI*2*(Ft+V%2*.5)/mt;Xt.push(u(lt+Math.cos(Wt)*it*1.05,Tt,jt+Math.sin(Wt)*it,"stem",2,!0)),$.push(.7)}w.push(Xt)}w.forEach((V,L)=>{for(let G=0;G<mt;G++){let it=V[G],lt=V[(G+1)%mt];if(Z.push(it),d(it,lt,.6),L<wt-1){let Tt=w[L+1],jt=L%2?Tt[G]:Tt[(G+mt-1)%mt],Xt=L%2?Tt[(G+1)%mt]:Tt[G];l.push(it,jt,Xt,it,Xt,lt),d(it,jt,.6),d(it,Xt,.6)}}})}let ft=new Float32Array(e),Ht=(O,k)=>(ft[O*3]-ft[k*3])**2+(ft[O*3+1]-ft[k*3+1])**2+(ft[O*3+2]-ft[k*3+2])**2,ie=(O,k)=>{let w=k[0],V=1/0;for(let L of k){let G=Ht(O,L);G<V&&(V=G,w=L)}return w};for(let O of ct)ft[O*3+1]>-.2&&ft[O*3+2]<-.7&&d(O,ie(O,K),0);for(let O=0;O<mt;O+=2)d(Z[O],ie(Z[O],B),0);d(Z[3*mt+6],ie(Z[3*mt+6],ct),0),d(Z[5*mt+6],ie(Z[5*mt+6],ct),0);let nt=new Uint8Array(c);for(let O=0;O<g;O++)nt[O]=$[O]>=.5&&b[O][1]>-.38&&Math.abs(ft[O*3])>.1?1:0;let rt=a.length,Rt=Array.from({length:c},()=>[]);for(let O=0;O<rt;O++)Rt[a[O]].push(r[O]),Rt[r[O]].push(a[O]);let St={frontal:[],parietal:[],temporal:[],occipital:[],cerebellum:[],stem:[]};for(let O=0;O<c;O++)St[FO[t[O]]].push(O);let Kt=0,Nt=0,Vt=0;for(let O=0;O<g;O++)Kt+=ft[O*3],Nt+=ft[O*3+1],Vt+=ft[O*3+2];Kt/=g,Nt/=g,Vt/=g;let me=0;for(let O=0;O<g;O++)me=Math.max(me,Math.hypot(ft[O*3]-Kt,ft[O*3+1]-Nt,ft[O*3+2]-Vt));let te=new Float64Array(c);{let O=0;for(let k=0;k<c;k++)te[k]=Math.hypot(ft[k*3]-h[0],ft[k*3+1]-h[1],ft[k*3+2]-h[2]),te[k]>O&&(O=te[k]);for(let k=0;k<c;k++)te[k]/=O}let C=new Int32Array(c+1),sn=new Int32Array(rt*2),ee=new Int32Array(rt*2),ce=new Float64Array(rt),j=new Float64Array(rt);{for(let k=0;k<rt;k++)C[a[k]+1]++,C[r[k]+1]++;for(let k=0;k<c;k++)C[k+1]+=C[k];let O=C.slice(0,c);for(let k=0;k<rt;k++){let w=a[k],V=r[k];sn[O[w]]=V,ee[O[w]++]=k,sn[O[V]]=w,ee[O[V]++]=k,ce[k]=Math.sqrt(Ht(w,V)),j[k]=Math.sqrt(Ht(w,V))*(1+5.5*.5*(te[w]**3+te[V]**3))}}let ut=(O,k)=>O<k?O*c+k:k*c+O,ot=(O,k)=>{for(let w=C[O],V=C[O+1];w<V;w++)if(sn[w]===k)return ee[w];return-1},E=new Float64Array(c),x=new Float64Array(c),P=new Int32Array(c),Q=new Uint32Array(c),tt=new Uint32Array(c),J=new Int32Array(rt*2+2),Ot=0,Mt=2.6,Et=(O,k,w,V)=>{if(O===k)return[O];++Ot===4294967295&&(Q.fill(0),tt.fill(0),Ot=1),Q[O]=Ot,E[O]=0,P[O]=-1,x[O]=Math.sqrt(Ht(O,k));let L=0;J[L++]=O;let G=!1;for(;L>0;){let lt=J[0],Tt=J[--L];if(L>0){J[0]=Tt;for(let Xt=0;;){let Ft=2*Xt+1,Wt=Ft+1,Ee=Xt;if(Ft<L&&x[J[Ft]]<x[J[Ee]]&&(Ee=Ft),Wt<L&&x[J[Wt]]<x[J[Ee]]&&(Ee=Wt),Ee===Xt)break;let Oe=J[Ee];J[Ee]=J[Xt],J[Xt]=Oe,Xt=Ee}}if(tt[lt]===Ot)continue;if(tt[lt]=Ot,lt===k){G=!0;break}let jt=E[lt];for(let Xt=C[lt],Ft=C[lt+1];Xt<Ft;Xt++){let Wt=sn[Xt];if(tt[Wt]===Ot)continue;let Ee=ee[Xt],Oe=jt+(V?w[Ee]*(1+Mt*V[Ee]):w[Ee]);if(Q[Wt]!==Ot||Oe<E[Wt]){Q[Wt]=Ot,E[Wt]=Oe,x[Wt]=Oe+Math.sqrt(Ht(Wt,k)),P[Wt]=lt;let Ie=L;for(J[L++]=Wt;Ie>0;){let ln=Ie-1>>1;if(x[J[ln]]<=x[J[Ie]])break;let ki=J[ln];J[ln]=J[Ie],J[Ie]=ki,Ie=ln}}}}if(!G)return null;let it=[];for(let lt=k;lt!==-1;lt=P[lt])it.push(lt);return it.reverse()},_e=O=>{let k=new Map;return(w,V)=>{if(w===V)return[w];let L=ut(w,V),G=k.get(L);return G===void 0&&(G=Et(w,V,O,null),k.size>=jO&&k.clear(),k.set(L,G)),G}},vt=_e(ce),Bt=_e(j),bt=null,$t=null,zt=O=>{let k=new Int32Array(O.length*2);for(let L=0;L<O.length;L++)k[L*2]=O[L][0],k[L*2+1]=O[L][1];if(bt&&$t&&bt.length===k.length&&bt.every((L,G)=>L===k[G]))return new Map($t);let w=new Float64Array(rt),V=new Map;for(let L of O){let G=ut(L[0],L[1]);if(V.has(G))continue;let it=L[0]===L[1]?[L[0]]:Et(L[0],L[1],j,w),lt=it&&it.length>=2?it:[L[0],L[1]];V.set(G,lt);for(let Tt=0;Tt<lt.length-1;Tt++){let jt=ot(lt[Tt],lt[Tt+1]);jt>=0&&(w[jt]+=1)}}return bt=k,$t=V,new Map(V)},de=new Uint32Array(rt*2);for(let O=0;O<rt;O++)de[O*2]=a[O],de[O*2+1]=r[O];return{positions:ft,edges:de,faces:new Uint32Array(l),regionOf:new Int8Array(t),adjacency:Rt,vertexCount:c,verticesByRegion:St,interiorVertices:B,edgeW:new Float32Array(o),vertW:new Float32Array($),cortex:nt,kind:new Uint8Array(n),surface:new Uint8Array(i),center:[h[0],h[1],h[2]],boundCenter:[Kt,Nt,Vt],boundRadius:me,pathBetween:vt,pathThroughInterior:Bt,routeContentEdges:zt}}function BT(){return Ny||(Ny=QO()),Ny}var FO,HO,_o,gi,Vu,kO,XO,WO,qO,YO,Uy,ZO,Ly,Oy,PT,Js,LT,Kd,Cy,Dy,Tr,OT,KO,jO,Ny,FT=gn(()=>{FO=["frontal","parietal","temporal","occipital","cerebellum","stem"],HO={frontal:0,parietal:1,temporal:2,occipital:3,cerebellum:4,stem:5};_o=e=>{let t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]},gi=(e,t,n)=>{let i=Math.max(0,Math.min(1,(n-e)/(t-e)));return i*i*(3-2*i)},Vu=(e,t,n)=>e+(t-e)*n;kO=-1.15,XO=1.15,WO=jd([[-1.15,.22],[-1.139,.355],[-1.07,.557],[-.948,.739],[-.784,.89],[-.58,1.025],[-.377,1.11],[-.173,1.138],[.03,1.133],[.235,1.102],[.437,1.043],[.642,.967],[.805,.874],[.966,.739],[1.07,.66],[1.125,.565],[1.15,.42]]),qO=jd([[-1.15,.22],[-1.13,.09],[-1.07,-.03],[-.987,-.1],[-.823,-.18],[-.58,-.27],[-.377,-.345],[-.173,-.38],[.03,-.38],[.235,-.362],[.437,-.326],[.56,-.25],[.615,-.11],[.655,.02],[.72,.045],[.844,.083],[1.007,.163],[1.09,.25],[1.135,.33],[1.15,.42]]),YO=jd([[-1.15,.22],[-1.12,.1],[-1,-.05],[-.8,-.14],[-.5,-.24],[-.2,-.29],[.1,-.29],[.33,-.25],[.5,-.15],[.62,-.01],[.72,.045],[.844,.083],[1.007,.163],[1.09,.25],[1.135,.33],[1.15,.42]]),Uy=.86,ZO=jd([[-1.15,0],[-1.1155,.23],[-1.081,.39],[-.966,.62],[-.805,.78],[-.575,.885],[-.345,.92],[-.115,.92],[.115,.885],[.345,.84],[.575,.76],[.805,.62],[.966,.46],[1.081,.28],[1.127,.16],[1.15,0]]),Ly=e=>ZO(e)*Uy,Oy=e=>.014+.241*Math.max(0,Math.min(1.15,(.62-e)/.99)),PT=e=>-.3+.38*Math.pow(Math.min(1,Math.max(0,e)),.8),Js=[0,.42,0];LT=e=>_o([e[0]*.92*Uy,e[1]*.76,e[2]*1.15]);Kd=e=>{let t=zT(e);return[Js[0]+e[0]*t,Js[1]+e[1]*t,Js[2]+e[2]*t]},Cy=15.5,Dy=1.15,Tr=-.12,OT=(e,t,n)=>gi(t*.7,t,e)*(1-gi(n,n*1.3,e));KO=4,jO=8192;Ny=null});function HT(e,t){let n=e.vertexCount,i=e.positions,s=e.adjacency,a=new Map,r=new Uint8Array(n).fill(1),o=(j,ut)=>(i[j*3]-i[ut*3])**2+(i[j*3+1]-i[ut*3+1])**2+(i[j*3+2]-i[ut*3+2])**2,l=[],c=[];for(let j=0;j<n;j++)e.cortex[j]?l.push(j):e.kind[j]===1&&c.push(j);let u=(j,ut)=>{a.set(j,ut),r[ut]=0},d=(j,ut)=>{let ot=-1,E=-1;for(let x of j){if(!r[x])continue;let P=1/0;for(let Q of ut){let tt=o(x,Q);tt<P&&(P=tt)}P>E&&(E=P,ot=x)}return ot},h=j=>{let ut=new Float64Array(j.length).fill(1/0);return{feed:ot=>{for(let E=0;E<j.length;E++){let x=o(j[E],ot);x<ut[E]&&(ut[E]=x)}},pick:()=>{let ot=-1,E=-1;for(let x=0;x<j.length;x++)r[j[x]]&&ut[x]>E&&(E=ut[x],ot=j[x]);return ot}}},p=j=>e.cortex[j]===1,g=j=>e.kind[j]===1,S=j=>e.surface[j]===0,m=j=>e.kind[j]===0&&e.surface[j]===1,f=()=>!0,y=j=>{for(let ut of s[j])if(!r[ut]&&e.cortex[ut])return!1;return!0},_=j=>i[j*3]*.62+(i[j*3+1]-.3)*.35+i[j*3+2]*.6,b=new Int32Array(n),D=new Int16Array(n),R=new Int32Array(n),A=0,N=(j,ut,ot,E=0,x)=>{A++;let P=0;R[P++]=j,b[j]=A,D[j]=0;for(let Q=0;Q<P;Q++){let tt=R[Q];if(tt!==j&&r[tt]&&ot(tt)&&(!x||x(tt)))return tt;if(E&&D[tt]>=E)continue;let J=s[tt];for(let Ot=0;Ot<J.length;Ot++){let Mt=J[Ot];b[Mt]!==A&&(!ut||m(Mt))&&(b[Mt]=A,D[Mt]=D[tt]+1,R[P++]=Mt)}}return-1},et=(j,ut)=>{A++;let ot=0;R[ot++]=j,b[j]=A;for(let E=0;E<ot;E++){let x=s[R[E]];for(let P=0;P<x.length;P++){let Q=x[P];b[Q]!==A&&(!ut||m(Q))&&(b[Q]=A,R[ot++]=Q)}}return R.slice(1,ot)},v=1/0;{let j=0;for(let ut of t.nodes)ut.kind==="group"&&!ut.centered&&j++;if(j>1&&l.length){let ut=new Float64Array(l.length).fill(1/0),ot=l[0],E=-1/0,x=0;for(let P of l){let Q=_(P);Q>E&&(E=Q,ot=P)}for(let P=1;P<j;P++){let Q=ot;x=-1;for(let tt=0;tt<l.length;tt++){let J=o(l[tt],ot);J<ut[tt]&&(ut[tt]=J),ut[tt]>x&&(x=ut[tt],Q=l[tt])}ot=Q}v=Math.sqrt(x)/2}}let M=Math.min(.45,v)**2,F=v**2,q=Math.min(.42,v)**2,K=0,$=1,B=2,ct=3,Z=4,wt=new Map,mt=(j,ut)=>{let ot=wt.get(j);ot||(ot={skin:null,lattice:null,at:[0,0,0,0,0]},wt.set(j,ot));let E=ut<=B?ot.skin??=et(j,!0):ot.lattice??=et(j,!1),x=ot.at[ut];for(;x<E.length;x++){let P=E[x];if(r[P]&&(ut===K?p(P)&&o(P,j)<=M&&y(P):ut===$?p(P)&&o(P,j)<=F:ut!==ct||S(P)))break}return ot.at[ut]=x,x<E.length?E[x]:-1},ft=(j,ut)=>{let ot=ut?mt(j,K):-1;return ot<0&&(ot=mt(j,$)),ot<0&&(ot=mt(j,B)),ot<0?mt(j,Z):ot},Ht=new Map;for(let j of t.structureEdges)Ht.set(j.target,j.source);let ie=new Map,nt=new Set,rt=new Map,Rt=[],St=[],Kt=[],Nt=h(l),Vt=h(l),me=h(c),te=null,C=null,sn=j=>{Rt.push(j),Nt.feed(j),Vt.feed(j),te?.feed(j)},ee=j=>{St.push(j),Vt.feed(j),te?.feed(j)},ce=()=>{if(!te||!C){C=new Uint8Array(n),C[0]=1;for(let ot of et(0,!1))C[ot]=1;let ut=[];for(let ot=0;ot<n;ot++)C[ot]&&e.kind[ot]===0&&!e.cortex[ot]&&ut.push(ot);te=h(ut);for(let ot of Rt)te.feed(ot);for(let ot of St)te.feed(ot)}let j=te.pick();if(j>=0)return j;for(let ut=0;ut<n;ut++)if(r[ut]&&C[ut])return ut;return-1};for(let j of t.nodes)if(j.kind==="group"){let ut=-1;if(j.centered){nt.add(j.id);let ot=1/0;for(let E of e.interiorVertices){if(!r[E])continue;let x=(i[E*3]-e.center[0])**2+(i[E*3+1]-e.center[1])**2+(i[E*3+2]-e.center[2])**2;x<ot&&(ot=x,ut=E)}ut<0&&(ut=ce())}else{if(Rt.length)ut=Nt.pick();else{let ot=-1/0;for(let E of l){if(!r[E])continue;let x=_(E);x>ot&&(ot=x,ut=E)}}ut<0&&(ut=ce()),ut>=0&&sn(ut)}ut>=0&&(u(j.id,ut),ie.set(j.id,ut),rt.set(j.id,[ut]))}else if(j.kind==="folder"){let ut=Ht.get(j.id),ot=ut!==void 0?ie.get(ut):void 0;if(ut===void 0||ot===void 0)continue;let E=rt.get(ut)??[ot],x=-1,P=-1;N(ot,!1,p,9,Q=>{if(o(Q,ot)>q)return!1;let tt=1/0;for(let J of E){let Ot=o(Q,J);Ot<tt&&(tt=Ot)}return tt>P&&(P=tt,x=Q),!1}),x<0&&(x=ft(ot,!1)),x>=0&&(u(j.id,x),ie.set(j.id,x),E.push(x))}else if(j.kind==="note"){let ut=Ht.get(j.id),ot=ut!==void 0?ie.get(ut):void 0,E=-1;ut!==void 0&&ot!==void 0?nt.has(ut)?(E=mt(ot,ct),E<0&&(E=mt(ot,Z))):E=ft(ot,!0):(j.favorited&&(E=Kt.length?me.pick():d(c,Rt),E>=0&&(Kt.push(E),me.feed(E))),E<0&&(E=Rt.length+St.length?Vt.pick():d(l,[l[0]]),E<0&&(E=ce()),E>=0&&ee(E))),E>=0&&(u(j.id,E),ie.set(j.id,E))}else{let ut=ie.get(`n:${j.noteId}`);if(ut===void 0)continue;let ot=g(ut)?g:p(ut)?p:f,E=-1;for(let x of s[ut])if(r[x]&&ot(x)){E=x;break}if(E<0&&m(ut)){let x=-1;E=N(ut,!0,f,3,P=>p(P)?!0:(x<0&&(x=P),!1)),E<0&&(E=x)}else E<0&&(E=N(ut,!1,ot));E<0&&(E=N(ut,!1,f)),E>=0&&u(j.id,E)}return a}var VT=gn(()=>{});function kT(e,t){let n=HT(e,t),i=e.positions,s=e.vertexCount,a=(v,M)=>Math.hypot(i[v*3]-i[M*3],i[v*3+1]-i[M*3+1],i[v*3+2]-i[M*3+2]),r=(v,M)=>v<M?v*s+M:M*s+v,o=[],l=new Map;for(let v of t.nodes){let M=n.get(v.id);if(M==null)continue;let F={id:v.id,index:o.length,kind:v.kind,tier:JO[v.kind],label:v.label,colorVar:v.colorVar,refId:v.refId,noteId:v.noteId,sectionId:v.sectionId,groupId:v.groupId,centered:v.centered===!0,noteNodeId:v.noteId!=null&&(v.kind==="note"||v.kind==="section")?`n:${v.noteId}`:null,parent:-1,v:M,x:i[M*3],y:i[M*3+1],z:i[M*3+2]};o.push(F),l.set(v.id,F)}let c=new Map,u=[],d=[];for(let v=bo;v<=GT;v++)for(let M of t.structureEdges){let F=l.get(M.source),q=l.get(M.target);if(!F||!q||q.tier!==v)continue;q.parent=F.index;let K=F.v,$=q.v,B=c.get(M.source)??0;if(v===GT){d.push({u:K,w:$,colorVar:q.colorVar,arcU:B,arcW:B+a(K,$)});continue}let ct=e.pathBetween(K,$);if(ct&&ct.length>=2){let Z=ct.length,wt=ct[0]===K;for(let mt=0;mt<Z-1;mt++){let ft=wt?ct[mt]:ct[Z-1-mt],Ht=wt?ct[mt+1]:ct[Z-2-mt],ie=a(ft,Ht);u.push({u:ft,w:Ht,colorVar:q.colorVar,arcU:B,arcW:B+ie,count:1}),B+=ie}}else{let Z=a(K,$);u.push({u:K,w:$,colorVar:q.colorVar,arcU:B,arcW:B+Z,count:1}),B+=Z}c.set(M.target,B)}let h=new Map;for(let v of u){let M=r(v.u,v.w),F=h.get(M);F?F.count++:h.set(M,{...v})}let p=[...h.values()],g=[];for(let v of t.contentEdges){let M=n.get(v.source),F=n.get(v.target);M!=null&&F!=null&&g.push({source:v.source,target:v.target,score:v.score,content:!0,a:M,b:F})}for(let v of t.relationEdges){let M=n.get(v.source),F=n.get(v.target);M!=null&&F!=null&&g.push({source:v.source,target:v.target,score:1,content:!1,a:M,b:F})}let S=g.map((v,M)=>M).sort((v,M)=>g[M].score-g[v].score).map(v=>[g[v].a,g[v].b]),m=S.length?e.routeContentEdges(S):new Map,f=(v,M)=>{let F=m.get(r(v,M))??e.pathThroughInterior(v,M);return(!F||F.length<2)&&(F=[v,M]),F[0]===v?F:F.slice().reverse()},y=[],_=new Map,b=new Map,D=(v,M,F)=>{let q=v.get(M);q?q.push(F):v.set(M,[F])};for(let v of g){let M=f(v.a,v.b),F=0;for(let K=0;K<M.length-1;K++)F+=a(M[K],M[K+1]);let q=y.length;y.push({source:v.source,target:v.target,seq:M,total:F||1,content:v.content,score:v.score}),v.content?(D(_,v.source,q),D(_,v.target,q)):(D(b,v.source,l.get(v.target).index),D(b,v.target,l.get(v.source).index))}let R=[],A=new Set;for(let v of[!1,!0])for(let M of y)if(M.content===v)for(let F=0;F<M.seq.length-1;F++){let q=r(M.seq[F],M.seq[F+1]);A.has(q)||(A.add(q),R.push({u:M.seq[F],w:M.seq[F+1],content:v}))}let N=o.find(v=>v.tier===pc&&v.centered);if(!N){let v=t.nodes.find(M=>M.kind==="group"&&M.centered);v&&(N=o.find(M=>M.tier===mc&&M.groupId===v.id))}let et=N?[N.x,N.y,N.z]:[e.center[0],e.center[1],e.center[2]];return{assignment:n,placed:o,byId:l,structRaw:u,structDedup:p,dend:d,synSegs:R,edgePaths:y,contentOf:_,relatedOf:b,connected:[..._.keys()],core:et,coreId:N?N.id:null}}function XT(e,t){return e.map((n,i)=>i).sort((n,i)=>e[i].score-e[n].score).slice(0,Math.max(0,t))}function WT(e,t,n,i){if(i.fill(0),!t)return i;let s=e.placed;if(i[t.index]=1,t.tier===pc)for(let o of s)o.groupId===t.id&&(i[o.index]=1);else if(t.tier===bo)for(let o of s){let l=o.parent;(l===t.index||l>=0&&s[l].parent===t.index)&&(i[o.index]=1)}else if(t.noteId!=null)for(let o of s)o.noteId===t.noteId&&(i[o.index]=1);let a=e.relatedOf.get(t.id);if(a)for(let o of a)i[o]=1;let r=n&&t.noteNodeId?e.contentOf.get(t.noteNodeId):void 0;if(r)for(let o of r){let l=e.edgePaths[o],c=e.byId.get(l.source),u=e.byId.get(l.target);c&&(i[c.index]=1),u&&(i[u.index]=1)}return i}function qT(e){let t=e.positions,n=e.vertexCount,[i,s,a]=e.center,r=new Float32Array(n),o=0;for(let l=0;l<n;l++)r[l]=Math.hypot(t[l*3]-i,t[l*3+1]-s,t[l*3+2]-a),r[l]>o&&(o=r[l]);if(o>0)for(let l=0;l<n;l++)r[l]=r[l]/o*.7;return r}function YT(e){let t=e.positions,n=e.faces,i=e.vertexCount,s=2,a=0;for(let g=0;g<n.length;g+=3)e.kind[n[g]]===s&&(a+=3);let r=i<65535?new Uint16Array(n.length+a):new Uint32Array(n.length+a);r.set(n);let o=3,l=new Float64Array(o),c=new Float64Array(o),u=new Float64Array(o),d=new Float64Array(o);for(let g=0;g<i;g++){if(!e.surface[g])continue;let S=e.kind[g];l[S]+=t[g*3],c[S]+=t[g*3+1],u[S]+=t[g*3+2],d[S]++}for(let g=0;g<o;g++)d[g]&&(l[g]/=d[g],c[g]/=d[g],u[g]/=d[g]);let h=new Float64Array(o);for(let g=0;g<n.length;g+=3){let S=e.kind[n[g]],m=n[g]*3,f=n[g+1]*3,y=n[g+2]*3,_=t[m]-l[S],b=t[m+1]-c[S],D=t[m+2]-u[S],R=t[f]-l[S],A=t[f+1]-c[S],N=t[f+2]-u[S],et=t[y]-l[S],v=t[y+1]-c[S],M=t[y+2]-u[S];h[S]+=_*(A*M-N*v)+b*(N*et-R*M)+D*(R*v-A*et)}let p=n.length;for(let g=0;g<n.length;g+=3){let S=e.kind[n[g]];h[S]<0&&(r[g+1]=n[g+2],r[g+2]=n[g+1]),S===s&&(r[p]=r[g],r[p+1]=r[g+2],r[p+2]=r[g+1],p+=3)}return r}function Iy(e,t,n,i=!1){let s=t.length;if(s===0)return{count:0,points:new Float32Array(0),arc:new Float32Array(0)};let a=d=>(i?t[s-1-d]:t[d])*3,r=s>2&&n>1?Math.floor(n):1,o=(s-1)*r+1,l=new Float32Array(o*3),c=new Float32Array(o);if(r===1)for(let d=0;d<s;d++){let h=a(d);l[d*3]=e[h],l[d*3+1]=e[h+1],l[d*3+2]=e[h+2]}else{let d=[0,0,0,0,0,0,0,0,0,0,0,0],h=(f,y)=>{let _=a(y);d[f]=e[_],d[f+1]=e[_+1],d[f+2]=e[_+2]},p=(f,y,_)=>{let b=a(y),D=a(_);for(let R=0;R<3;R++)d[f+R]=2*e[b+R]-e[D+R]},g=(f,y)=>Math.pow((d[f]-d[y])**2+(d[f+1]-d[y+1])**2+(d[f+2]-d[y+2])**2,.25),S=0;for(let f=0;f<s-1;f++){f>0?h(0,f-1):p(0,0,1),h(3,f),h(6,f+1),f+2<s?h(9,f+2):p(9,s-1,s-2);let y=g(0,3),_=g(3,6),b=g(6,9);_<1e-4&&(_=1),y<1e-4&&(y=_),b<1e-4&&(b=_);for(let D=0;D<r;D++){let R=D/r,A=R*R,N=A*R;for(let et=0;et<3;et++){let v=d[et],M=d[3+et],F=d[6+et],q=d[9+et],K=((M-v)/y-(F-v)/(y+_)+(F-M)/_)*_,$=((F-M)/_-(q-M)/(_+b)+(q-F)/b)*_;l[S*3+et]=M+K*R+(-3*M+3*F-2*K-$)*A+(2*M-2*F+K+$)*N}S++}}let m=a(s-1);l[S*3]=e[m],l[S*3+1]=e[m+1],l[S*3+2]=e[m+2]}for(let d=1;d<o;d++)c[d]=c[d-1]+Math.hypot(l[d*3]-l[d*3-3],l[d*3+1]-l[d*3-2],l[d*3+2]-l[d*3-1]);let u=c[o-1]||1;for(let d=0;d<o;d++)c[d]/=u;return{count:o,points:l,arc:c}}var JO,pc,bo,mc,GT,ZT=gn(()=>{VT();JO={group:0,folder:1,note:2,section:3},pc=0,bo=1,mc=2,GT=3});function KT(e){return Math.round((1-(e<=0?0:e>=1?1:e))*63)<<2}function as(e){return e<=0?0:e>=1?255:Math.round(e*255)}var $O,Ua,jT=gn(()=>{$O=127;Ua=class{count=0;capacity;a;b;col;arc;rev;width;constructor(t,n=!0){let i=Math.max(0,Math.floor(t));this.capacity=i,this.a=new Float32Array(i*3),this.b=new Float32Array(i*3),this.col=new Uint8Array(i*4),this.arc=n?new Float32Array(i*2):null,this.rev=new Uint8Array(i*4),this.width=new Float32Array(i)}add(t,n,i,s,a,r,o,l,c,u,d,h,p,g,S,m,f){this.count===this.capacity&&this.grow();let y=this.count++,_=y*3,b=y*4;this.a[_]=t,this.a[_+1]=n,this.a[_+2]=i,this.b[_]=s,this.b[_+1]=a,this.b[_+2]=r,this.col[b]=as(o),this.col[b+1]=as(l),this.col[b+2]=as(c),this.col[b+3]=u&255,this.arc&&(this.arc[y*2]=d,this.arc[y*2+1]=h),this.rev[b]=as(p),this.rev[b+1]=as(g),this.rev[b+2]=as(S),this.rev[b+3]=Math.max(0,Math.min(255,Math.round(m*$O))),this.width[y]=f}grow(){let t=Math.max(16,this.capacity*2),n=(s,a)=>{let r=new Float32Array(t*a);return r.set(s),r},i=(s,a)=>{let r=new Uint8Array(t*a);return r.set(s),r};this.a=n(this.a,3),this.b=n(this.b,3),this.col=i(this.col,4),this.arc&&(this.arc=n(this.arc,2)),this.rev=i(this.rev,4),this.width=n(this.width,1),this.capacity=t}finish(){let t=this.count;return t===this.capacity?{count:t,a:this.a,b:this.b,col:this.col,arc:this.arc,rev:this.rev,width:this.width}:{count:t,a:this.a.slice(0,t*3),b:this.b.slice(0,t*3),col:this.col.slice(0,t*4),arc:this.arc?this.arc.slice(0,t*2):null,rev:this.rev.slice(0,t*4),width:this.width.slice(0,t)}}}});function JT(e,t){return{core:e==="group"?1.3:1.05,ring:t?.72:.94,alpha:e==="section"?.7:e==="note"?.86:1,fill:.07}}var Qd,La,gc,QT,Py=gn(()=>{Qd={aa:.6,zBias:.014,fade:[.28,.92],focusDim:.62,focusEase:.14,trunk:.42,trunkMax:2.3,hoverWave:.8,color:{saturation:.67,energy:.7925,lightDarken:.62,lightOpacity:2.6,lightOpacityMax:.95,lightNeutral:.45},wire:{width:1,opacity:.36,light:.5,lerp:.1,lerpLight:.25,back:.5,depthW:.2,interior:3,breathe:.01,boost:.9,revealGlow:3,hiddenOpacity:.05,hiddenInterior:4,widthBase:.8,widthByWeight:.5,lightFloor:.25,hiddenMinWeight:.06},dots:{size:.021,opacity:.85,light:.6,back:.5,interior:.5,soft:.45,boost:.55,hiddenOpacity:.19,hiddenInterior:1.5},nodes:{ringW:.07,core:1,coreSoft:.45,glow:.42,glowLight:.35,glowSize:2.7,glowExtent:6.5,extent:1.08,back:.75,glowBack:.1,hiddenAlpha:.2,waveSize:.32,revealOffset:.14},routes:{width:1.5,opacity:.62,back:.75,mul:1,flow:1.3,freq:1,speed:.2,len:.32,revealGlow:1.2,hiddenOpacity:.2,revealOffset:.12},dend:{width:1.05,opacity:.5,revealOffset:.14},syn:{width:.9,opacity:.09,light:.5,lerp:.34,lerpLight:.24,back:.8,impulses:1.25,revealOffset:.16,lightRef:850,lightMin:.3},impulse:{width:1.15,len:.03,freq:.09,speed:.1,toText:.25,opacity:.62,back:.45,rateMin:.6,rateSpread:.8},sweep:{width:1.35,mul:1.15,back:.6,tail:.4,fill:.22,thinkFill:.1,markerSize:.07,markerBoost:1.8},atmos:{core:.55,coreOpacity:.11,coreScale:3.1,coreDy:-.05,coreAccent:.25,vignette:.16,vignetteLight:.35,lift:.5,liftAmount:.03,grain:.012},bloom:{strength:.24,radius:.55,threshold:.22,breathe:.03},motion:{waves:.09,waveGain:.7,waveLife:2.4,firstWave:1.2,rotate:.35,heart:6.5,firstHeart:2.6,intro:2.4},think:{every:.16,jitter:.12,life:.6,lifeJitter:.3,hold:.6,waveGap:.9,citedWaves:5,citedGap:.42,citedStill:.595},sparks:{size:.03,boost:1.4,first:1.5,every:2.2,jitter:3,life:.3,lifeJitter:.2,tail:4,tailGap:.06},background:{floor:{y:-1.08,dz:-.1,opacity:.2,size:[3.4,2.4],hot:[1.5,1],breathe:.1,fadeFrom:.3,fadeTo:.7},far:{count:220,radius:4.6,spread:3.4,flatten:.6,link:1.25,near:3.6,opacity:.04,opacityLight:.16,flow:2,freq:.5,speed:.035,len:.2,lerp:[.1,.62],lerpLight:[.3,.72]},farDots:{size:.042,twinkle:.45,drift:0,opacity:.42,opacityLight:.5,lerp:.2,lerpLight:.4,near:3.4,soft:.25},motes:{count:260,inner:1.25,spread:2.1,flatten:.75,size:.013,twinkle:.85,drift:.04,opacity:.34,opacityLight:.4,lerp:.1,lerpLight:.4,near:3.4,soft:.25}},camera:{fov:50,position:[3.16,1.01,1.03],target:[0,.3,0],minDistance:1.6,maxDistance:7,damping:.08,fitAspect:.92},labels:{folderDist:2.8,noteDist:2.2,opacity:[.95,.82,.7,.7],hiddenDepth:.52,hiddenFade:.25,maxChars:24,charWidth:6.1,groupCharWidth:7.6,boxPad:10,boxAbove:15,boxBelow:1,lift:.4,liftPad:4,liftMax:110,toText:.45}},La={impulseEdges:160,impulseSubdiv:3,sweepSubdiv:6,thinkSweeps:6,sparks:6},gc={group:.075,folder:.052,note:.04,section:.026},QT=.014});var tI,$T,zy,tA,eA,nA,iA,sA,aA,rA,oA,lA,cA=gn(()=>{Py();tI=e=>Number.isInteger(e)?e.toFixed(1):String(e),$T=tI(Qd.motion.waveLife),zy=`
uniform float uTime;
uniform vec3 uCenter;      // centre of the brain's bounding sphere\u2026
uniform float uRadius;     // \u2026and its radius: together they normalise depth across the brain
uniform float uReveal;     // entrance front, grows from 0 outwards from the core
uniform float uRevealOn;   // 1 while the entrance plays
uniform mat4 uWaves;       // four ripples, one per column: xyz = origin, w = start time (< 0 = unused)
uniform float uWaveGain;
uniform vec2 uFade;
uniform float uZBias;

// 0 at the point of the brain nearest to the camera, 1 at the farthest.
float depthN(float mvz) {
  float zc = (viewMatrix * vec4(uCenter, 1.0)).z;
  return clamp(((zc + uRadius) - mvz) / (2.0 * uRadius), 0.0, 1.0);
}
float fadeBy(float dn, float back) {
  return mix(1.0, back, smoothstep(uFade.x, uFade.y, dn));
}
// One ripple at a point: a thin shell that expands from its origin and fades out over its life.
float ripple(vec3 p, vec4 wave) {
  float age = uTime - wave.w;
  float live = (wave.w >= 0.0 && age >= 0.0 && age < ${$T}) ? 1.0 : 0.0;
  float x = (distance(p, wave.xyz) - age * 0.95) / 0.12;
  return exp(-x * x) * (1.0 - age / ${$T}) * live;
}
// Sum of the live ripples. The columns are indexed with constants on purpose: indexing a matrix
// with a loop variable makes the Direct3D shader compiler (Windows) emit a warning, which three
// then logs.
float waveAt(vec3 p) {
  return (ripple(p, uWaves[0]) + ripple(p, uWaves[1]) + ripple(p, uWaves[2]) + ripple(p, uWaves[3])) * uWaveGain;
}
// Clip-space z of a view-space point pulled toward the camera by uZBias, for a vertex whose w is
// already known: keeps what sits on the surface in front of the depth skin.
float biasedZ(vec4 mv, float w) {
  vec4 q = mv;
  q.z += uZBias;
  vec4 cb = projectionMatrix * q;
  return cb.z / cb.w * w;
}
// Entrance: dim until the front arrives (rev = distance from the core, 0..~0.9)\u2026
float revealAt(float rev) {
  return uRevealOn > 0.5 ? mix(0.2, 1.0, smoothstep(0.0, 0.12, uReveal - rev)) : 1.0;
}
// \u2026and a flash as it passes.
float revealEdge(float rev) {
  if (uRevealOn < 0.5) return 0.0;
  float x = (uReveal - rev - 0.05) / 0.07;
  return exp(-x * x);
}
`,tA=zy+`
attribute vec3 aA;
attribute vec3 aB;
attribute vec4 aCol;
attribute vec2 aArc;
attribute vec4 aRevPh;
attribute float aWidth;
uniform vec2 uRes;           // drawing buffer size, device px
uniform float uPx;           // device pixel ratio
uniform vec4 uShape;         // width (CSS px) \xB7 thinning with depth \xB7 opacity \xD7 of the inner lattice \xB7 opacity left at the back
uniform vec4 uTone;          // colour \xD7 \xB7 entrance glow \xB7 near fade distance (0 = off) \xB7 how strongly ripples light the line up
uniform vec2 uCull;          // what this pass skips: 1 = the inner lattice \xB7 surface segments no wider than this (aWidth; 0 = none)
uniform float uShowContent;  // 0 hides the content relations (AI off); user relations stay
varying vec3 vCol;
varying float vAlpha;
varying float vSide;
varying float vHalf;
varying float vArc;
varying float vBoost;
varying vec2 vPh;
void main() {
  // flags byte: bit 0 inner lattice \xB7 bit 1 content relation \xB7 six high bits = how much opacity to drop
  float flags = floor(aCol.a * 255.0 + 0.5);
  float interior = mod(flags, 2.0);
  float content = mod(floor(flags * 0.5), 2.0);
  // A segment this pass has no use for leaves before any work is done, as a point outside the
  // clip volume (no fragments): a content relation while those are hidden, or what uCull names.
  if ((content > 0.5 && uShowContent < 0.5) || (interior > 0.5 ? uCull.x > 0.5 : aWidth <= uCull.y)) {
    vCol = vec3(0.0);
    vAlpha = 0.0;
    vSide = 0.0;
    vHalf = 0.0;
    vArc = 0.0;
    vBoost = 0.0;
    vPh = vec2(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float t = position.x;
  float side = position.y;
  vec4 mvA = modelViewMatrix * vec4(aA, 1.0);
  vec4 mvB = modelViewMatrix * vec4(aB, 1.0);
  vec4 cA = projectionMatrix * mvA;
  vec4 cB = projectionMatrix * mvB;
  vec2 sA = cA.xy / cA.w * uRes * 0.5;
  vec2 sB = cB.xy / cB.w * uRes * 0.5;
  vec2 dir = sB - sA;
  float len = length(dir);
  dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 mv = mix(mvA, mvB, t);
  float dn = depthN(mv.z);
  float w = uShape.x * uPx * aWidth * mix(1.0 + uShape.y, 1.0 - uShape.y, dn);
  // a line thinner than a pixel keeps a 1px quad and fades instead (plus 2px for the soft edge)
  float geo = max(w, 1.0) + 2.0;
  vec4 c = mix(cA, cB, t);
  c.xy += nrm * side * geo * 0.5 / (uRes * 0.5) * c.w;
  if (uZBias > 0.0) c.z = biasedZ(mv, c.w);

  float keep = 1.0 - floor(flags * 0.25) / 63.0;
  float rev = mix(aRevPh.x, aRevPh.y, t);
  vCol = aCol.rgb * uTone.x;
  vAlpha = min(w, 1.0) * fadeBy(dn, uShape.w) * mix(1.0, uShape.z, interior) * revealAt(rev) * keep;
  if (uTone.z > 0.0) vAlpha *= smoothstep(uTone.z * 0.45, uTone.z, -mv.z);
  vBoost = (waveAt(mix(aA, aB, t)) + revealEdge(rev) * uTone.y) * uTone.w;
  vArc = mix(aArc.x, aArc.y, t);
  vPh = vec2(aRevPh.z, aRevPh.w * (255.0 / 127.0));
  vSide = side * geo * 0.5;
  vHalf = max(w, 1.0) * 0.5;
  gl_Position = c;
}
`,eA=`
uniform float uTime;
uniform float uOpacity;
uniform float uAA;
uniform vec4 uFlow;    // pulse strength (0 = none) \xB7 opacity between pulses (0 = only the pulses show) \xB7 frequency along the arc \xB7 speed
uniform vec4 uSweep;   // pulse length \xB7 sweep head along the arc (99 = fully drawn) \xB7 sweep envelope \xB7 opacity left at the far end
varying vec3 vCol;
varying float vAlpha;
varying float vSide;
varying float vHalf;
varying float vArc;
varying float vBoost;
varying vec2 vPh;
void main() {
  float edge = 1.0 - smoothstep(vHalf - uAA, vHalf + uAA, abs(vSide));
  float a = uOpacity * vAlpha * edge * uSweep.z * clamp((uSweep.y - vArc) / 0.06, 0.0, 1.0) * mix(1.0, uSweep.w, clamp(vArc, 0.0, 1.0));
  float pulse = 0.0;
  if (uFlow.x > 0.0) {
    float ph = fract(vArc * uFlow.z - uTime * uFlow.w * vPh.y + vPh.x);
    pulse = smoothstep(1.0 - uSweep.x, 1.0, ph);
    pulse *= pulse;
  }
  float extra = pulse * uFlow.x + vBoost;
  a *= uFlow.y + extra;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * (1.0 + extra * 0.55), min(a, 1.0));
}
`,nA=zy+`
attribute vec4 aDot;
uniform float uScale;      // half the drawing buffer height: world size \u2192 device px at distance 1
uniform vec4 uDot;         // size (world) \xB7 opacity left at the back \xB7 opacity \xD7 of the inner lattice \xB7 1 = brightness follows the vertex weight
uniform vec4 uAnim;        // twinkle \xB7 drift \xB7 how strongly ripples light the dot up \xB7 near fade distance (0 = off)
uniform vec3 uColor;
varying float vAlpha;
varying vec3 vCol;
void main() {
  float inner = aDot.x;
  float rev = aDot.y;
  float seed = aDot.z;
  vec3 p = position;
  if (uAnim.y > 0.0) p += uAnim.y * vec3(sin(uTime * 0.21 + seed * 31.0), cos(uTime * 0.17 + seed * 17.0), sin(uTime * 0.19 + seed * 53.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  if (uZBias > 0.0) gl_Position.z = biasedZ(mv, gl_Position.w);
  float dn = depthN(mv.z);
  float wv = waveAt(p) * uAnim.z + revealEdge(rev);
  float s = uDot.x * uScale / -mv.z * (1.0 + wv * 0.5);
  gl_PointSize = max(s, 1.5);
  float tw = 1.0 - uAnim.x * (0.5 + 0.5 * sin(uTime * (0.8 + seed * 1.7) + seed * 40.0));
  vAlpha = min(s / 1.5, 1.0) * fadeBy(dn, uDot.y) * mix(1.0, uDot.z, inner) * revealAt(rev) * tw * (1.0 + wv);
  if (uAnim.w > 0.0) vAlpha *= smoothstep(uAnim.w * 0.45, uAnim.w, -mv.z);
  vCol = uColor * mix(1.0, aDot.w, uDot.w) * (1.0 + wv * 0.6);
}
`,iA=`
uniform float uOpacity;
uniform float uSoft;
varying float vAlpha;
varying vec3 vCol;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(uSoft, 1.0, d)) * uOpacity * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol, min(a, 1.0));
}
`,sA=`
uniform vec4 uNode;        // sprite half-size in ring radii \xB7 opacity left at the back \xB7 mode (0 node, 1 halo) \xB7 opacity
`,aA=zy+sA+`
attribute vec3 aColor;
attribute float aSize;
attribute vec4 aStyle;
attribute vec4 aState;
uniform float uScale;
uniform float uFocusAmt;   // 0..1: how far the focus dim has faded in
uniform float uDimTo;      // opacity left on a node unrelated to the focused one
uniform float uCore;
uniform float uWaveSize;
uniform float uHaloCut;    // radius (in ring radii) by which a plain halo has faded below the discard threshold
varying vec3 vColor;
varying vec4 vStyle;
varying float vAlpha;
varying float vPx;
varying float vLit;
varying float vSeed;
varying float vCoreR;
varying float vWave;
varying float vExt;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  if (uZBias > 0.0) gl_Position.z = biasedZ(mv, gl_Position.w);
  float dn = depthN(mv.z);
  float rev = aState.w;
  float rv = uRevealOn > 0.5 ? mix(0.28, 1.0, smoothstep(0.0, 0.08, uReveal - rev)) : 1.0;
  float pop = 1.0;
  if (uRevealOn > 0.5) {
    float x = (uReveal - rev - 0.09) / 0.07;
    pop += 0.45 * exp(-x * x);
  }
  vWave = waveAt(position);
  float ring = aSize * pop * (1.0 + vWave * uWaveSize);
  // The halo sprite is as large as the rings of a cited note travel. A node that is not cited
  // only has its glow, gone long before that edge: it gets a sprite just big enough for it \u2014
  // the same picture for a fraction of the fragments.
  float ext = uNode.x;
  if (uNode.z > 0.5 && aState.x < 0.5) ext = min(ext, uHaloCut);
  float s = max(ring * ext * uScale / -mv.z, 2.0);
  gl_PointSize = s;
  vPx = 2.0 * ext / s;
  vExt = ext;
  vAlpha = fadeBy(dn, uNode.y) * rv * mix(1.0, mix(uDimTo, 1.0, aState.y), uFocusAmt);
  vColor = aColor;
  vStyle = aStyle;
  vLit = aState.x;
  vSeed = aState.z;
  vCoreR = uCore / aSize;
}
`,rA=sA+`
uniform vec2 uLit;         // the cited-note signal: its clock \xB7 how much each node's seed offsets it.
                           // Normally (time, 1). With reduced motion (a constant, 0): the rings and
                           // the glow stand still, the same on every cited node.
uniform float uRingW;
uniform float uCoreSoft;
uniform float uGlow;
uniform float uGlowSize;
varying vec3 vColor;
varying vec4 vStyle;
varying float vAlpha;
varying float vPx;
varying float vLit;
varying float vSeed;
varying float vCoreR;
varying float vWave;
varying float vExt;
float ringAt(float d, float r, float hw) {
  return 1.0 - smoothstep(hw - vPx, hw + vPx, abs(d - r));
}
void main() {
  float ext = uNode.x;
  // distance from the centre, in ring radii (vExt: the half-size this sprite was actually given)
  float d = length(gl_PointCoord - 0.5) * 2.0 * vExt;
  if (uNode.z < 0.5) {
    float ring = ringAt(d, 0.78, uRingW) * vStyle.z;
    float core = 1.0 - smoothstep(vCoreR * uCoreSoft, vCoreR, d);
    float fill = (1.0 - smoothstep(0.78 - vPx, 0.78 + vPx, d)) * vStyle.w;
    // fill, then the ring over it, then the centre over both (premultiplied, divided out at the end)
    vec3 rgb = vColor * vStyle.y * fill;
    float a = fill;
    rgb = vColor * vStyle.y * ring + rgb * (1.0 - ring);
    a = ring + a * (1.0 - ring);
    rgb = vColor * vStyle.x * core + rgb * (1.0 - core);
    a = core + a * (1.0 - core);
    float k = vAlpha * uNode.w;
    if (a * k < 0.004) discard;
    gl_FragColor = vec4(rgb / max(a, 1e-4), min(a * k, 1.0));
  } else {
    float g = exp(-d * d / (uGlowSize * uGlowSize * 0.2)) * uGlow * (1.0 + vWave * 1.5);
    g *= 1.0 - smoothstep(ext * 0.72, ext, d);
    float lit = 0.0;
    vec3 c = vColor;
    if (vLit > 0.5) {
      for (int i = 0; i < 2; i++) {
        float ph = fract(uLit.x * 0.42 + vSeed * uLit.y + float(i) * 0.5);
        lit += ringAt(d, 0.9 + ph * (ext - 1.7), max(0.07, vPx * 1.15)) * (1.0 - ph) * (1.0 - ph) * 0.9;
      }
      lit += exp(-d * d / 2.4) * (0.6 + 0.2 * sin(uLit.x * 2.4 + vSeed * 6.283 * uLit.y));
      c = vColor * 1.45;
    }
    float a = (g + lit) * vAlpha * uNode.w;
    if (a < 0.004) discard;
    gl_FragColor = vec4(c, min(a, 1.0));
  }
}
`,oA=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,lA=`
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;  // the bloom pass's composite (every mip, strength applied), at its own resolution
uniform float uBloomOn;    // 0: no bloom (light themes), or the pass still blends it itself
uniform vec2 uCenterUv;    // where the brain's centre lands on screen
uniform float uAspect;
uniform float uVig;
uniform float uLift;
uniform vec3 uLiftCol;
uniform float uGrain;
uniform float uTime;
uniform vec3 uCore;        // the light inside the brain: where its centre lands (xy, uv) and its radius in screen heights (0 = none)
uniform vec3 uCoreCol;     // its colour \xD7 opacity
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  // The bloom, exactly as its pass would have blended it: additive, weighted by its own alpha,
  // clipped at 1 like the 8-bit buffer it used to be written to. (textureLod: no derivatives
  // inside a branch.)
  if (uBloomOn > 0.5) {
    vec4 b = textureLod(tBloom, vUv, 0.0);
    c.rgb = min(c.rgb + b.rgb * b.a, 1.0);
  }
  // The inner light: a round glow with the falloff of the old sprite's texture \u2014 1 at the centre,
  // 0.42 at a quarter of the radius, 0.1 at 0.6, 0 at the rim, straight lines in between.
  if (uCore.z > 0.0) {
    vec2 d = vUv - uCore.xy;
    d.x *= uAspect;
    float k = length(d) / uCore.z;
    float g = k < 0.25 ? mix(1.0, 0.42, k / 0.25) : (k < 0.6 ? mix(0.42, 0.1, (k - 0.25) / 0.35) : mix(0.1, 0.0, min((k - 0.6) / 0.4, 1.0)));
    c.rgb = min(c.rgb + uCoreCol * g, 1.0);
  }
  vec2 q = vUv - uCenterUv;
  q.x *= uAspect;
  float r = length(q);
  c.rgb += uLiftCol * uLift * exp(-r * r * 6.0);
  c.rgb *= 1.0 - uVig * smoothstep(0.3, 1.05, r);
  float n = fract(sin(dot(gl_FragCoord.xy + floor(uTime * 24.0) * 7.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  c.rgb += n * uGrain;
  gl_FragColor = c;
}
`});var hA=ls(Jd=>{"use strict";var eI=Symbol.for("react.transitional.element"),nI=Symbol.for("react.fragment");function uA(e,t,n){var i=null;if(n!==void 0&&(i=""+n),t.key!==void 0&&(i=""+t.key),"key"in t){n={};for(var s in t)s!=="key"&&(n[s]=t[s])}else n=t;return t=n.ref,{$$typeof:eI,type:e,key:i,ref:t!==void 0?t:null,props:n}}Jd.Fragment=nI;Jd.jsx=uA;Jd.jsxs=uA});var By=ls((fP,fA)=>{"use strict";fA.exports=hA()});function ky(e){let n=document.createElement("canvas");n.width=n.height=64,e(n.getContext("2d"),64);let i=new Id(n);return i.needsUpdate=!0,i}function ep(e){let t=e.finish(),n=new zd;return n.setAttribute("position",new ai([0,-1,0,0,1,0,1,-1,0,1,1,0],3)),n.setIndex([0,1,2,2,1,3]),n.setAttribute("aA",new Na(t.a,3)),n.setAttribute("aB",new Na(t.b,3)),n.setAttribute("aCol",new Na(t.col,4,!0)),t.arc&&n.setAttribute("aArc",new Na(t.arc,2)),n.setAttribute("aRevPh",new Na(t.rev,4,!0)),n.setAttribute("aWidth",new Na(t.width,1)),n.instanceCount=t.count,n}function Gy(e,t){try{performance.clearMeasures(e),performance.measure(e,{start:t,end:performance.now()})}catch{}}function uI({model:e,showContentEdges:t,onOpenNote:n,onOpenGroup:i,highlightedNoteIds:s,thinking:a,onNodeActivate:r}){let o=(0,rs.useRef)(null),l=AT(g=>g.activeThemeId),c=(0,rs.useMemo)(()=>DT(),[l]),u=(0,rs.useRef)({model:e,showContentEdges:t,palette:c,onOpenNote:n,onOpenGroup:i,highlightedNoteIds:s,thinking:a,onNodeActivate:r});u.current={model:e,showContentEdges:t,palette:c,onOpenNote:n,onOpenGroup:i,highlightedNoteIds:s,thinking:a,onNodeActivate:r};let d=(0,rs.useRef)(null),h=(0,rs.useRef)(!1),p=(0,rs.useRef)(!0);return(0,rs.useEffect)(()=>{let g=o.current;if(!g)return;let S=performance.now(),m=u.current.palette,f=window.matchMedia("(prefers-reduced-motion: reduce)"),y=f.matches,_=[],b=U=>(_.push(U),U),D=tp(m.bg),R=tp(m.text),A=mA(D),N=A<.5,et=N?wa:Ys,v=U=>N?U:Math.min(Y.color.lightOpacityMax,U*Y.color.lightOpacity),M=Y.color.energy,F=new Map,q=U=>{let st=F.get(U);if(!st){if(st=tp(m.color(U)),U!=="--text"){let dt=mA(st),ht=Y.color.saturation;st.setRGB(dt+(st.r-dt)*ht,dt+(st.g-dt)*ht,dt+(st.b-dt)*ht)}N||st.multiplyScalar(Y.color.lightDarken),F.set(U,st)}return st},K=Math.min(window.devicePixelRatio||1,2),$=g.clientWidth,B=g.clientHeight,ct=new Ud({antialias:!1});ct.outputColorSpace=js,ct.setPixelRatio(K),ct.setClearColor(D,1),ct.setSize(Math.max(1,$),Math.max(1,B));let Z=ct.domElement;Z.style.cursor="grab",g.appendChild(Z);let wt=new Ld;wt.background=D;let mt=performance.now(),ft=BT();Gy("brain:mesh",mt);let Ht=ft.positions,ie=ft.vertexCount,nt=qT(ft),[rt,Rt,St]=ft.boundCenter,Kt=ft.boundRadius,Nt=new mi(Y.camera.fov,$>0&&B>0?$/B:1,.1,100);Nt.position.set(Y.camera.position[0],Y.camera.position[1],Y.camera.position[2]);let Vt=new Xd(Nt,Z);Vt.enableDamping=!0,Vt.dampingFactor=Y.camera.damping,Vt.enablePan=!1,Vt.minDistance=Y.camera.minDistance,Vt.maxDistance=Y.camera.maxDistance,Vt.target.set(Y.camera.target[0],Y.camera.target[1],Y.camera.target[2]),Vt.autoRotate=!y,Vt.autoRotateSpeed=Y.motion.rotate;let me=1,te=()=>{let U=$>0&&B>0?Math.max(1,Y.camera.fitAspect/($/B)):1;Nt.position.sub(Vt.target).multiplyScalar(U/me).add(Vt.target),Vt.maxDistance=Y.camera.maxDistance*U,me=U};te();let C={uTime:{value:0},uCenter:{value:new W(rt,Rt,St)},uRadius:{value:Kt},uReveal:{value:2},uRevealOn:{value:0},uWaves:{value:new Float32Array([0,0,0,-1,0,0,0,-1,0,0,0,-1,0,0,0,-1])},uWaveGain:{value:Math.max(Y.motion.waveGain,Y.hoverWave)},uFade:{value:new Yt(Y.fade[0],Y.fade[1])},uZBias:{value:Y.zBias},uRes:{value:new Yt(Math.max(1,$)*K,Math.max(1,B)*K)},uPx:{value:K},uScale:{value:Math.max(1,B)*K*.5},uShowContent:{value:u.current.showContentEdges?1:0},uFocusAmt:{value:0},uLit:{value:new Yt(0,1)}},sn=()=>({uTime:C.uTime,uCenter:C.uCenter,uRadius:C.uRadius,uReveal:C.uReveal,uRevealOn:C.uRevealOn,uWaves:C.uWaves,uWaveGain:C.uWaveGain,uFade:C.uFade,uZBias:C.uZBias}),ee=U=>b(new un({uniforms:{...sn(),uRes:C.uRes,uPx:C.uPx,uShowContent:C.uShowContent,uShape:{value:new ke(U.width,U.depthW??0,U.interior??1,U.back??1)},uTone:{value:new ke(U.mul??1,U.revGlow??0,U.near??0,U.boost??0)},uCull:{value:new Yt(U.skipInterior?1:0,U.skipBelow??0)},uOpacity:{value:U.opacity},uAA:{value:Y.aa},uFlow:{value:new ke(U.flow??0,U.flowBase??1,U.freq??1,U.speed??0)},uSweep:{value:new ke(U.len??.3,U.head??99,1,U.tail??1)}},vertexShader:tA,fragmentShader:eA,transparent:!0,depthWrite:!1,depthTest:U.depthTest===!0,depthFunc:U.depthFunc??Ks,blending:U.add?wa:Ys,side:ii})),ce=U=>b(new un({uniforms:{...sn(),uScale:C.uScale,uDot:{value:new ke(U.size,U.back??1,U.interior??1,U.weighted?1:0)},uAnim:{value:new ke(0,0,U.boost??0,U.near??0)},uColor:{value:U.color.clone()},uOpacity:{value:U.opacity},uSoft:{value:U.soft}},vertexShader:nA,fragmentShader:iA,transparent:!0,depthWrite:!1,depthTest:U.depthTest,depthFunc:U.depthFunc??Ks,blending:et,side:ii})),j=(N?Y.nodes.glow:Y.nodes.glow*Y.nodes.glowLight)*M,ut=j*(1+1.5*4*C.uWaveGain.value),ot=1.05*Y.nodes.glowSize*Math.sqrt(.2*Math.log(Math.max(Math.E,ut/.004))),E=(U,st)=>b(new un({uniforms:{...sn(),uScale:C.uScale,uFocusAmt:C.uFocusAmt,uLit:C.uLit,uNode:{value:new ke(st.ext,st.back,U,st.opacity??1)},uDimTo:{value:1-Y.focusDim},uCore:{value:QT*Y.nodes.core},uWaveSize:{value:Y.nodes.waveSize},uRingW:{value:Y.nodes.ringW},uCoreSoft:{value:Y.nodes.coreSoft},uGlow:{value:j},uGlowSize:{value:Y.nodes.glowSize},uHaloCut:{value:ot}},vertexShader:aA,fragmentShader:rA,transparent:!0,depthWrite:!1,depthTest:st.depthTest,depthFunc:st.depthFunc??Ks,blending:st.add?wa:Ys,side:ii})),x=(U,st,dt)=>{let ht=new si(U,st);return ht.frustumCulled=!1,ht.renderOrder=dt,wt.add(ht),ht},P=(U,st,dt)=>{let ht=new Od(U,st);return ht.frustumCulled=!1,ht.renderOrder=dt,wt.add(ht),ht},Q=[],tt=U=>(Q.push({u:U.uniforms.uOpacity,base:U.uniforms.uOpacity.value}),U),J=b(oI()),Ot=b(lI()),Mt=new qe(Ht,3);{let U=b(new En);U.setAttribute("position",Mt),U.setIndex(new qe(YT(ft),1));let st=new si(U,b(new Da({colorWrite:!1,depthWrite:!0,depthTest:!0,side:Zs,polygonOffset:!0,polygonOffsetFactor:2,polygonOffsetUnits:2})));st.frustumCulled=!1,st.renderOrder=Nn.skin,wt.add(st)}let Et=R.clone().lerp(D,N?Y.wire.lerp:Y.wire.lerpLight),_e=N?Y.wire.opacity:Y.wire.light,vt=0,Bt;{let U=ft.edges.length/2,st=new Ua(U,!1);for(let Ut=0;Ut<U;Ut++){let Dt=ft.edgeW[Ut];if(Dt<=0)continue;let Jt=ft.edges[Ut*2],ue=ft.edges[Ut*2+1],xe=ft.surface[Jt]===0||ft.surface[ue]===0,Ze,gt,yt;if(N){let ne=Math.min(1,Dt);Ze=Et.r*ne,gt=Et.g*ne,yt=Et.b*ne}else{let ne=Math.min(1,Y.wire.lightFloor+(1-Y.wire.lightFloor)*Dt);Ze=As(D.r,Et.r,ne),gt=As(D.g,Et.g,ne),yt=As(D.b,Et.b,ne)}st.add(Ht[Jt*3],Ht[Jt*3+1],Ht[Jt*3+2],Ht[ue*3],Ht[ue*3+1],Ht[ue*3+2],Ze,gt,yt,xe?1:0,0,0,nt[Jt],nt[ue],0,1,Y.wire.widthBase+Y.wire.widthByWeight*Dt)}vt=st.count;let dt=b(ep(st)),ht={width:Y.wire.width,opacity:_e,back:Y.wire.back,depthW:Y.wire.depthW,interior:Y.wire.interior,boost:Y.wire.boost,revGlow:Y.wire.revealGlow,add:N,depthTest:!0};Bt=ee({...ht,skipInterior:!0}),x(dt,Bt,Nn.wire),x(dt,tt(ee({...ht,opacity:_e*Y.wire.hiddenOpacity/Math.max(Y.wire.opacity,.01),interior:Y.wire.hiddenInterior,depthFunc:Er,skipBelow:N?Y.wire.widthBase+Y.wire.widthByWeight*Y.wire.hiddenMinWeight:0})),Nn.wireHidden)}{let U=new Uint8Array(ie*4),st=xo(7);for(let Ut=0;Ut<ie;Ut++)U[Ut*4]=ft.surface[Ut]?0:255,U[Ut*4+1]=as(nt[Ut]),U[Ut*4+2]=as(st()),U[Ut*4+3]=as(ft.vertW[Ut]);let dt=b(new En);dt.setAttribute("position",Mt),dt.setAttribute("aDot",new qe(U,4,!0));let ht={size:Y.dots.size,opacity:N?Y.dots.opacity:Y.dots.light,color:Et,soft:Y.dots.soft,back:Y.dots.back,interior:Y.dots.interior,weighted:N,boost:Y.dots.boost,depthTest:!0};P(dt,tt(ce(ht)),Nn.dots),P(dt,tt(ce({...ht,opacity:Y.dots.hiddenOpacity,back:1,interior:Y.dots.hiddenInterior,depthFunc:Er})),Nn.dotsHidden)}let bt=Y.background,$t=0,zt=null,de=[];{let U=(yt,ne,xt,_t)=>{let It=yt.length/3,Zt=new Uint8Array(It*4),be=xo(ne);for(let yn=0;yn<It;yn++)Zt[yn*4+1]=as(.5),Zt[yn*4+2]=as(be());let Se=b(new En);Se.setAttribute("position",new qe(yt,3)),Se.setAttribute("aDot",new qe(Zt,4,!0));let mn=ce({size:xt.size,opacity:N?xt.opacity:xt.opacityLight,color:Et.clone().lerp(D,N?xt.lerp:xt.lerpLight),soft:xt.soft,near:xt.near,depthTest:!1});P(Se,mn,_t),de.push({mat:mn,twinkle:xt.twinkle,drift:xt.drift})},st=xo(20260711),dt=bt.far.count,ht=new Float64Array(dt*4);for(let yt=0;yt<dt;yt++){let ne=st()*2-1,xt=st()*Math.PI*2,_t=Math.sqrt(1-ne*ne),It=bt.far.radius+st()*bt.far.spread;ht[yt*4]=rt+_t*Math.cos(xt)*It,ht[yt*4+1]=Rt+ne*It*bt.far.flatten,ht[yt*4+2]=St+_t*Math.sin(xt)*It,ht[yt*4+3]=(It-bt.far.radius)/bt.far.spread}let Ut=N?bt.far.lerp:bt.far.lerpLight,Dt=new Ua(dt*2),Jt=new Set,ue=bt.far.link*bt.far.link;for(let yt=0;yt<dt;yt++){let ne=-1,xt=-1,_t=1/0,It=1/0;for(let Zt=0;Zt<dt;Zt++){if(Zt===yt)continue;let be=(ht[yt*4]-ht[Zt*4])**2+(ht[yt*4+1]-ht[Zt*4+1])**2+(ht[yt*4+2]-ht[Zt*4+2])**2;be<_t?(It=_t,xt=ne,_t=be,ne=Zt):be<It&&(It=be,xt=Zt)}for(let Zt=0;Zt<2;Zt++){let be=Zt===0?ne:xt,Se=Zt===0?_t:It;if(be<0||Se>ue)continue;let mn=yt<be?yt*dt+be:be*dt+yt;if(Jt.has(mn))continue;Jt.add(mn);let yn=(As(Ut[0],Ut[1],ht[yt*4+3])+As(Ut[0],Ut[1],ht[be*4+3]))/2,Ia=st(),Pa=.5+st();Dt.add(ht[yt*4],ht[yt*4+1],ht[yt*4+2],ht[be*4],ht[be*4+1],ht[be*4+2],As(Et.r,D.r,yn),As(Et.g,D.g,yn),As(Et.b,D.b,yn),0,0,1,.5,.5,Ia,Pa,1)}}$t=Dt.count,Dt.count&&(zt=ee({width:1,opacity:N?bt.far.opacity:bt.far.opacityLight,back:1,near:bt.far.near,flow:bt.far.flow,freq:bt.far.freq,speed:bt.far.speed,len:bt.far.len,add:N,depthTest:!1}),x(b(ep(Dt)),zt,Nn.farLines));let xe=new Float32Array(dt*3);for(let yt=0;yt<dt;yt++)xe[yt*3]=ht[yt*4],xe[yt*3+1]=ht[yt*4+1],xe[yt*3+2]=ht[yt*4+2];U(xe,11,bt.farDots,Nn.farDots);let Ze=bt.motes.count,gt=new Float32Array(Ze*3);for(let yt=0;yt<Ze;yt++){let ne=st()*2-1,xt=st()*Math.PI*2,_t=Math.sqrt(1-ne*ne),It=Kt*(bt.motes.inner+st()*bt.motes.spread);gt[yt*3]=rt+_t*Math.cos(xt)*It,gt[yt*3+1]=Rt+ne*It*bt.motes.flatten,gt[yt*3+2]=St+_t*Math.sin(xt)*It}U(gt,23,bt.motes,Nn.motes)}let O=R.clone().lerp(tp(m.color("--accent")),Y.atmos.coreAccent),k=N?Y.atmos.coreOpacity*Y.atmos.core:0,w=Rt+Y.atmos.coreDy,V=Kt*Y.atmos.coreScale/2,L=null;if(N){let U=bt.floor.y,st=St+bt.floor.dz,dt=[],ht=[],Ut=[];for(let[Jt,ue]of[bt.floor.size,bt.floor.hot]){let xe=dt.length/3;dt.push(rt-Jt/2,U,st-ue/2,rt+Jt/2,U,st-ue/2,rt-Jt/2,U,st+ue/2,rt+Jt/2,U,st+ue/2),ht.push(0,0,1,0,0,1,1,1),Ut.push(xe,xe+1,xe+2,xe+2,xe+1,xe+3)}let Dt=b(new En);Dt.setAttribute("position",new ai(dt,3)),Dt.setAttribute("uv",new ai(ht,2)),Dt.setIndex(Ut),L=b(new Da({map:b(cI()),color:R,transparent:!0,opacity:bt.floor.opacity,blending:wa,depthWrite:!1,depthTest:!1,fog:!1,side:ii,forceSinglePass:!0})),x(Dt,L,Nn.floor)}let G=(...U)=>{for(let st of U)st.visible=!1;return{objects:U,geo:null,count:0}},it=(U,st,dt)=>{U.geo&&U.geo.dispose(),U.geo=st,U.count=dt;for(let ht of U.objects)ht.geometry=st??$s,ht.visible=st!==null&&dt>0},lt=(U,st)=>it(U,st.count?ep(st):null,st.count),Tt=Y.routes.flow*M,jt={width:Y.routes.width,opacity:v(Y.routes.opacity*M),back:Y.routes.back,mul:Y.routes.mul,flow:Tt,freq:Y.routes.freq,speed:Y.routes.speed,len:Y.routes.len,revGlow:Y.routes.revealGlow,depthTest:!0},Xt=tt(ee(jt)),Ft=tt(ee({...jt,opacity:jt.opacity*Y.routes.hiddenOpacity,depthFunc:Er})),Wt=Y.dend.width/Y.routes.width,Ee=KT(v(Y.dend.opacity*M)/jt.opacity),Oe=R.clone().lerp(D,Y.color.lightNeutral),Ie=U=>!N&&U==="--text"?Oe:q(U),ln=tt(ee({width:Y.syn.width,opacity:N?Y.syn.opacity:Y.syn.light,back:Y.syn.back,depthTest:!1})),ki=Q[Q.length-1],ws=0,os=0,vi=()=>{if(N)return;let U=C.uShowContent.value>.5?ws:os,st=U>0?Math.min(1,Math.max(Y.syn.lightMin,Math.sqrt(Y.syn.lightRef/U))):1;ki.base=Y.syn.light*st,Ln=!0},Ar=ee({width:Y.impulse.width,opacity:Y.impulse.opacity,back:Y.impulse.back,flow:Y.syn.impulses*M,flowBase:0,freq:Y.impulse.freq,speed:Y.impulse.speed,len:Y.impulse.len,add:N,depthTest:!1}),oe=[Xt,Ft],Te=G(x($s,Xt,Nn.routes),x($s,Ft,Nn.routesHidden)),Kn=0,ri=0,wi=G(x($s,ln,Nn.synapses)),jn=G(x($s,Ar,Nn.impulses)),T=G(P($s,E(1,{ext:Y.nodes.glowExtent,back:Y.nodes.glowBack,add:N,depthTest:!1}),Nn.glow),P($s,E(0,{ext:Y.nodes.extent,back:Y.nodes.back,depthTest:!0}),Nn.nodes),P($s,E(0,{ext:Y.nodes.extent,back:Y.nodes.back,depthTest:!0,depthFunc:Er,opacity:Y.nodes.hiddenAlpha}),Nn.nodesHidden)),I=[];for(let U=0;U<La.thinkSweeps+1;U++){let st=ee({width:Y.sweep.width,opacity:1,back:Y.sweep.back,mul:Y.sweep.mul,head:0,tail:Y.sweep.tail,depthTest:!1}),dt=x($s,st,Nn.sweeps);dt.visible=!1;let ht=new qe(new Float32Array(3),3);ht.setUsage(Bu);let Ut=b(new En);Ut.setAttribute("position",ht),Ut.setAttribute("color",new qe(new Float32Array([1,1,1,1]),4));let Dt=b(new ac({map:Ot,vertexColors:!0,size:Y.sweep.markerSize,transparent:!0,depthWrite:!1,depthTest:!1,blending:et,sizeAttenuation:!0,alphaTest:.02,side:ii,forceSinglePass:!0})),Jt=P(Ut,Dt,Nn.marker);Jt.visible=!1,I.push({mode:$d,hasLines:!1,start:0,dur:0,line:dt,sweep:st.uniforms.uSweep.value,marker:Jt,markerMat:Dt,markerPos:ht})}let H=Y.sparks,X=[];for(let U=0;U<La.sparks;U++)X.push({alive:!1,start:0,dur:1,ax:0,ay:0,az:0,bx:0,by:0,bz:0});let z=new Float32Array(La.sparks*H.tail*3),pt=new Float32Array(La.sparks*H.tail*4),Ct=new qe(z,3),Pt=new qe(pt,4);Ct.setUsage(Bu),Pt.setUsage(Bu);let At=b(new En);At.setAttribute("position",Ct),At.setAttribute("color",Pt),At.setDrawRange(0,0);let Qt=P(At,b(new ac({map:J,vertexColors:!0,size:H.size,transparent:!0,depthWrite:!1,blending:et,sizeAttenuation:!0,alphaTest:.02,side:ii,forceSinglePass:!0})),Nn.sparks),qt=!1,kt=Et.r*H.boost,De=Et.g*H.boost,Be=Et.b*H.boost,Fe=0,en=new Yd(ct,new Zn(Math.max(1,$)*K,Math.max(1,B)*K,{type:bs}));en.addPass(new Zd(wt,Nt));let ae=null;N&&(ae=new fc(new Yt(Math.max(1,$),Math.max(1,B)),Y.bloom.strength,Y.bloom.radius,Math.max(Y.bloom.threshold,A)),en.addPass(ae));let Gt=null;if(ae){let U=ae,st=U.renderTargetsHorizontal?.[0]?.texture;U.blendMaterial&&st&&(U.blendMaterial.visible=!1,Gt=st)}let Xe={tDiffuse:{value:null},tBloom:{value:Gt},uBloomOn:{value:Gt?1:0},uCore:{value:new W(.5,.5,0)},uCoreCol:{value:new fe(0,0,0)},uCenterUv:{value:new Yt(.5,.5)},uAspect:{value:1},uVig:{value:N?Y.atmos.vignette:Y.atmos.vignette*Y.atmos.vignetteLight},uLift:{value:N?Y.atmos.liftAmount*Y.atmos.lift:0},uLiftCol:{value:R.clone()},uGrain:{value:Y.atmos.grain},uTime:{value:0}},Ae=new hc(new un({uniforms:Xe,vertexShader:oA,fragmentShader:lA,depthTest:!1,depthWrite:!1}));en.addPass(Ae);let Hn=()=>{en.setSize(Math.max(1,$),Math.max(1,B)),ae&&ae.setSize(Math.max(1,$),Math.max(1,B))};Hn();let ge,Un=null,hn=new Float32Array(0),pe=null,Ri=new Uint8Array(0),oi=0,re=0,wr=performance.now(),So=null,Ln=!0,Mo=-1,TA=0,np=0,qy=Y.motion.firstWave,Yy=Y.motion.firstHeart,Zy=H.first,Ky=0,jy=-100,Eo=0,AA=0,Xi=null,ta=null,ip=null,Qy=!1,sp=!0,Wi=null,ap=0,Oa=0,ea=u.current.highlightedNoteIds,vc=0,yc=[],ku=!0,Xu=[];for(let U=0;U<Y.think.citedWaves;U++)Xu.push(null);let To=0,Ao=0,Jy=0,$y=0,t_=0,_c=!1,e_=0,n_=0,rp=!1,Wu=!1,i_="grab",qu=new pn,wo=(U,st,dt)=>{let ht=C.uWaves.value,Ut=TA++%4*4;ht[Ut]=U,ht[Ut+1]=st,ht[Ut+2]=dt,ht[Ut+3]=re,np=re+Y.motion.waveLife,Ln=!0},s_=()=>{y||(Mo=re,C.uRevealOn.value=1,C.uReveal.value=0,Ln=!0)},Ro=U=>{U.hasLines&&(U.line.geometry.dispose(),U.line.geometry=$s,U.hasLines=!1),U.line.visible=!1,U.marker.visible=!1,U.mode=$d},a_=(U,st,dt)=>{let ht=null;for(let Dt=0;Dt<I.length;Dt++)if(I[Dt].mode===$d){ht=I[Dt];break}if(!ht)return null;ht.mode=st,ht.start=re,ht.dur=0,ht.markerPos.setXYZ(0,U.x,U.y,U.z),ht.markerPos.needsUpdate=!0,ht.markerMat.color.copy(q(U.colorVar)).multiplyScalar(N?Y.sweep.markerBoost:1),ht.markerMat.opacity=1,ht.marker.visible=!0;let Ut=dt&&U.noteNodeId?ge.contentOf.get(U.noteNodeId):void 0;if(Ut&&Ut.length){let Dt=q(U.colorVar),Jt=new Ua(Ut.length*48);for(let ue=0;ue<Ut.length;ue++){let xe=ge.edgePaths[Ut[ue]],Ze=Iy(Ht,xe.seq,La.sweepSubdiv,xe.source!==U.noteNodeId),gt=Ze.points;for(let yt=0;yt<Ze.count-1;yt++)Jt.add(gt[yt*3],gt[yt*3+1],gt[yt*3+2],gt[yt*3+3],gt[yt*3+4],gt[yt*3+5],Dt.r,Dt.g,Dt.b,0,Ze.arc[yt],Ze.arc[yt+1],0,0,0,1,1)}Jt.count&&(ht.line.geometry=ep(Jt),ht.sweep.y=0,ht.sweep.z=1,ht.line.visible=!0,ht.hasLines=!0)}return ht},r_=()=>{for(let U=0;U<I.length;U++)I[U].mode===Fy&&Ro(I[U]);Eo=0},wA=()=>{let U=ge.connected;if(!U.length)return null;if(ku){if(yc.length=0,ea&&ea.size)for(let dt=0;dt<U.length;dt++){let ht=ge.byId.get(U[dt]);ht&&ht.noteId!=null&&ea.has(ht.noteId)&&yc.push(U[dt])}ku=!1}let st=yc.length?yc[AA++%yc.length]:U[Math.random()*U.length|0];return ge.byId.get(st)??null},RA=U=>{let st=ge.placed,dt=U&&!y;vc=0,To=0,Ao=0,Jy=re;for(let ht=0;ht<st.length;ht++){let Ut=st[ht],Dt=Ut.tier===mc&&Ut.noteId!=null&&ea!==void 0&&ea.has(Ut.noteId);hn[ht*4]=Dt?1:0,Dt&&(vc++,dt&&To<Xu.length&&(Xu[To++]=Ut))}pe&&(pe.needsUpdate=!0),ku=!0},CA=(U,st)=>{WT(ge,U,st,Ri);for(let dt=0;dt<Ri.length;dt++)hn[dt*4+1]=Ri[dt];pe&&(pe.needsUpdate=!0)},Co=document.createElement("div");Co.style.cssText="position:absolute;inset:0;overflow:hidden;pointer-events:none;",g.appendChild(Co);let op=gA(D),DA=`position:absolute;left:0;top:0;white-space:nowrap;line-height:normal;will-change:transform,opacity;display:none;opacity:0;text-shadow:0 0 3px ${op},0 0 7px ${op},0 0 12px ${op};`,Do=[],lp=new Int32Array(0),cp=0,Yu=new Int32Array(0),Zu=new Int32Array(0),Ku=0,up=new Int32Array(0),hp=new Int32Array(0),ju=new Uint16Array(0),fp=new Uint8Array(0),dp=new Float32Array(0),pp=new Float32Array(0),mp=new Float32Array(0),na=new Float32Array(0),xc=new Int32Array(Hy+1),o_=-1,l_=[new Int32Array(0),new Int32Array(0),new Int32Array(0)],c_=()=>{for(let dt of Do)dt&&dt.el.remove();let U=ge?ge.placed.length:0,st=[[],[],[]];if(ge)for(let dt of ge.placed)dt.tier<=mc&&st[dt.tier].push(dt.index);l_=st.map(dt=>Int32Array.from(dt)),Do=new Array(U),lp=new Int32Array(U),Yu=new Int32Array(U),Zu=new Int32Array(U),Ku=0,up=new Int32Array(U),hp=new Int32Array(U),ju=new Uint16Array(U),fp=new Uint8Array(U),dp=new Float32Array(U),pp=new Float32Array(U),mp=new Float32Array(U),na=new Float32Array(U*4)},NA=U=>{let st=document.createElement("div");st.textContent=U.label.length>Y.labels.maxChars?U.label.slice(0,Y.labels.maxChars-1)+"\u2026":U.label,st.style.cssText=DA+rI[U.tier]+(y?"":"transition:opacity .22s ease;");let dt=q(U.colorVar);return st.style.color=gA(U.tier<=bo?dt:dt.clone().lerp(R,Y.labels.toText)),Co.appendChild(st),{el:st,qx:NaN,qy:NaN,op:0,shown:!1}},UA=(U,st)=>{let dt=Math.round(U*100);dt!==o_&&(o_=dt,Co.style.opacity=String(dt/100));let ht=ge.placed,Ut=ht.length,Dt=Y.labels;cp++;let Jt=0;if(Ut){let gt=Nt.position.distanceTo(Vt.target),yt=gt<Dt.folderDist*me,ne=gt<Dt.noteDist*me,xt=B/(2*Math.tan(Nt.fov*Math.PI/180/2)),_t=qu.elements,It=Nt.matrixWorldInverse.elements,Zt=Xi?ge.byId.get(Xi)?.index??-1:-1,be=ta?ge.byId.get(ta)?.index??-1:-1;for(let Se=0;Se<5;Se++){if(Se===1&&!yt||Se===2&&!ne)continue;let mn=Se<3?l_[Se]:null,yn=Se===3?Zt:Se===4&&be!==Zt?be:-1,Ia=mn?mn.length:yn>=0?1:0;for(let Pa=0;Pa<Ia;Pa++){let On=mn?mn[Pa]:yn,_n=ht[On],Rs=_n.tier;if(!mn&&(Rs===pc||Rs===bo&&yt||Rs===mc&&ne))continue;let bc=On===Zt||On===be,za=_t[3]*_n.x+_t[7]*_n.y+_t[11]*_n.z+_t[15];if(za<=0||(_t[2]*_n.x+_t[6]*_n.y+_t[10]*_n.z+_t[14])/za>1)continue;let Ba=((_t[0]*_n.x+_t[4]*_n.y+_t[8]*_n.z+_t[12])/za*.5+.5)*$,yp=(-(_t[1]*_n.x+_t[5]*_n.y+_t[9]*_n.z+_t[13])/za*.5+.5)*B;if(Ba<-60||Ba>$+60||yp<-20||yp>B+20)continue;let b_=It[2]*_n.x+It[6]*_n.y+It[10]*_n.z+It[14],S_=Math.max(0,Math.min(1,(st+Kt-b_)/(2*Kt))),LA=pA[Rs]*xt/Math.max(-b_,.001);up[Jt]=On,dp[Jt]=Ba,pp[Jt]=yp-Math.min(LA*Dt.lift+Dt.liftPad,Dt.liftMax),mp[Jt]=S_,fp[Jt]=bc?1:0,ju[Jt]=Math.min(Hy-1,((bc?0:Rs===pc?1:Rs===bo?2:3)+S_*.9)*64|0),Jt++}}}xc.fill(0);for(let gt=0;gt<Jt;gt++)xc[ju[gt]+1]++;for(let gt=0;gt<Hy;gt++)xc[gt+1]+=xc[gt];for(let gt=0;gt<Jt;gt++)hp[xc[ju[gt]]++]=gt;let ue=0,xe=0;for(let gt=0;gt<Jt;gt++){let yt=hp[gt],ne=up[yt],xt=ht[ne],_t=fp[yt]===1,It=_t?1:Dt.opacity[xt.tier]*(mp[yt]>Dt.hiddenDepth?Dt.hiddenFade:1),Zt=dp[yt],be=pp[yt],Se=(Math.min(xt.label.length,Dt.maxChars)*(xt.tier===pc?Dt.groupCharWidth:Dt.charWidth)+Dt.boxPad)/2,mn=Zt-Se,yn=Zt+Se,Ia=be-Dt.boxAbove,Pa=be+Dt.boxBelow;if(!_t){let bc=!1;for(let za=0;za<ue;za++){let Ba=za*4;if(mn<na[Ba+2]&&yn>na[Ba]&&Ia<na[Ba+3]&&Pa>na[Ba+1]){bc=!0;break}}if(bc)continue}na[ue*4]=mn,na[ue*4+1]=Ia,na[ue*4+2]=yn,na[ue*4+3]=Pa,ue++;let On=Do[ne];On||(On=Do[ne]=NA(xt));let _n=Math.round(Zt*10),Rs=Math.round(be*10);On.shown||(On.el.style.display="",On.shown=!0),(_n!==On.qx||Rs!==On.qy)&&(On.qx=_n,On.qy=Rs,On.el.style.transform=`translate(${_n/10}px,${Rs/10}px) translate(-50%,-100%)`),It!==On.op&&(On.op=It,On.el.style.opacity=String(It)),lp[ne]=cp,Yu[xe++]=ne}for(let gt=0;gt<Ku;gt++){let yt=Zu[gt];if(lp[yt]===cp)continue;let ne=Do[yt];ne&&ne.shown&&(ne.el.style.display="none",ne.el.style.opacity="0",ne.op=0,ne.shown=!1)}let Ze=Zu;Zu=Yu,Yu=Ze,Ku=xe},u_=(U,st)=>{let dt=ge.placed,ht=qu.elements,Ut=Nt.position.x,Dt=Nt.position.y,Jt=Nt.position.z,ue=null,xe=1/0;for(let Ze=0;Ze<dt.length;Ze++){let gt=dt[Ze],yt=ht[3]*gt.x+ht[7]*gt.y+ht[11]*gt.z+ht[15];if(yt<=0)continue;let ne=(ht[2]*gt.x+ht[6]*gt.y+ht[10]*gt.z+ht[14])/yt;if(ne>1)continue;let xt=((ht[0]*gt.x+ht[4]*gt.y+ht[8]*gt.z+ht[12])/yt*.5+.5)*$,_t=(-(ht[1]*gt.x+ht[5]*gt.y+ht[9]*gt.z+ht[13])/yt*.5+.5)*B,It=Math.hypot(xt-U,_t-st),Zt=Math.hypot(gt.x-Ut,gt.y-Dt,gt.z-Jt),be=Math.max(9,pA[gt.tier]*(B*.5)/Zt*.5+4);if(It<be){let Se=It+ne*40;Se<xe&&(xe=Se,ue=gt)}}return ue},h_=U=>{if(U===Un)return;Un=U;let st=performance.now();ge=kT(ft,U),Gy("brain:data",st);let dt=ge,ht=(Ut,Dt,Jt,ue,xe,Ze,gt,yt,ne)=>Ut.add(Ht[Dt*3],Ht[Dt*3+1],Ht[Dt*3+2],Ht[Jt*3],Ht[Jt*3+1],Ht[Jt*3+2],ue.r,ue.g,ue.b,xe,Ze,gt,nt[Dt]+yt,nt[Jt]+yt,0,1,ne);{let Ut=new Ua(dt.structDedup.length+dt.dend.length);for(let Dt of dt.structDedup)ht(Ut,Dt.u,Dt.w,Ie(Dt.colorVar),0,Dt.arcU,Dt.arcW,Y.routes.revealOffset,Math.min(Y.trunkMax,1+Y.trunk*Math.log2(Dt.count)));for(let Dt of dt.dend)ht(Ut,Dt.u,Dt.w,Ie(Dt.colorVar),Ee,Dt.arcU,Dt.arcW,Y.dend.revealOffset,Wt);Kn=dt.structDedup.length,ri=dt.dend.length,lt(Te,Ut)}{let Ut=q("--text").clone().lerp(D,N?Y.syn.lerp:Y.syn.lerpLight),Dt=new Ua(dt.synSegs.length,!1);ws=dt.synSegs.length,os=0;for(let Jt of dt.synSegs)Jt.content||os++,ht(Dt,Jt.u,Jt.w,Ut,Jt.content?2:0,0,1,Y.syn.revealOffset,1);lt(wi,Dt),vi()}{let Ut=XT(dt.edgePaths,La.impulseEdges),Dt=new Ua(Ut.length*32),Jt=xo(31337),ue=new fe;for(let xe of Ut){let Ze=dt.edgePaths[xe],gt=dt.byId.get(Ze.source);ue.copy(gt&&gt.colorVar!=="--text"?q(gt.colorVar):R).lerp(R,Y.impulse.toText);let yt=Jt(),ne=Y.impulse.rateMin+Jt()*Y.impulse.rateSpread,xt=Iy(Ht,Ze.seq,La.impulseSubdiv),_t=xt.points,It=Ze.content?2:0;for(let Zt=0;Zt<xt.count-1;Zt++)Dt.add(_t[Zt*3],_t[Zt*3+1],_t[Zt*3+2],_t[Zt*3+3],_t[Zt*3+4],_t[Zt*3+5],ue.r,ue.g,ue.b,It,xt.arc[Zt],xt.arc[Zt+1],0,0,yt,ne,1)}lt(jn,Dt),jn.objects[0].visible=Dt.count>0&&!y}{let Ut=dt.placed.length,Dt=new Float32Array(Ut*3),Jt=new Float32Array(Ut*3),ue=new Float32Array(Ut),xe=new Float32Array(Ut*4);hn=new Float32Array(Ut*4),Ri=new Uint8Array(Ut);let Ze=xo(555);vc=0;for(let gt=0;gt<Ut;gt++){let yt=dt.placed[gt],ne=q(yt.colorVar),xt=JT(yt.kind,yt.colorVar==="--text");Dt[gt*3]=yt.x,Dt[gt*3+1]=yt.y,Dt[gt*3+2]=yt.z,Jt[gt*3]=ne.r,Jt[gt*3+1]=ne.g,Jt[gt*3+2]=ne.b,ue[gt]=gc[yt.kind],xe[gt*4]=xt.core,xe[gt*4+1]=xt.ring,xe[gt*4+2]=xt.alpha,xe[gt*4+3]=xt.fill;let _t=yt.tier===mc&&yt.noteId!=null&&ea!==void 0&&ea.has(yt.noteId);_t&&vc++,hn[gt*4]=_t?1:0,hn[gt*4+2]=Ze(),hn[gt*4+3]=nt[yt.v]+Y.nodes.revealOffset}if(Ut){let gt=new En;gt.setAttribute("position",new qe(Dt,3)),gt.setAttribute("aColor",new qe(Jt,3)),gt.setAttribute("aSize",new qe(ue,1)),gt.setAttribute("aStyle",new qe(xe,4)),pe=new qe(hn,4),pe.setUsage(Bu),gt.setAttribute("aState",pe),it(T,gt,Ut)}else pe=null,it(T,null,0)}r_(),Wi&&(Ro(Wi),Wi=null),Xi&&!dt.byId.has(Xi)&&(Xi=null),ta&&!dt.byId.has(ta)&&(ta=null),sp=!0,ku=!0,To=0,Ao=0,c_(),Ln=!0},gp=()=>{if(y=f.matches,y){Vt.autoRotate=!1,Mo=-1,C.uRevealOn.value=0;let U=C.uWaves.value;U[3]=U[7]=U[11]=U[15]=-1,np=0,To=0,Ao=0}for(let U of oe)U.uniforms.uFlow.value.x=y?0:Tt;zt&&(zt.uniforms.uFlow.value.x=y?0:bt.far.flow);for(let U of de){let st=U.mat.uniforms.uAnim.value;st.x=y?0:U.twinkle,st.y=y?0:U.drift}jn.objects[0].visible=jn.count>0&&!y,ge&&c_(),Ln=!0};gp(),h_(u.current.model),h.current||s_();let f_=()=>{oi=0;let U=performance.now(),st=Math.min(.1,Math.max(0,(U-wr)/1e3));wr=U,So===null?re+=st:re=So;let dt=u.current,ht=!y&&So===null;C.uTime.value=re,Xe.uTime.value=re,y?C.uLit.value.set(Y.think.citedStill,0):C.uLit.value.set(re,1),Vt.update(st),Nt.updateMatrixWorld(),qu.multiplyMatrices(Nt.projectionMatrix,Nt.matrixWorldInverse);let Ut=dt.showContentEdges;C.uShowContent.value>.5!==Ut&&(C.uShowContent.value=Ut?1:0,vi(),Ln=!0);let Dt=1;if(Mo>=0){let xt=(re-Mo)/Y.motion.intro;xt>=1?(Mo=-1,C.uRevealOn.value=0):(C.uRevealOn.value=1,C.uReveal.value=(1-Math.pow(1-Math.max(0,xt),2.2))*1.25,Dt=.25+.75*vA(.5,.95,xt))}if(_c){_c=!1;let xt=u_($y,t_);Xi=xt?xt.id:null}let Jt=Xi?ge.byId.get(Xi):void 0,ue=Jt&&Jt.tier!==bo?"pointer":"grab";ue!==i_&&(i_=ue,Z.style.cursor=ue);let xe=Xi??ta;if(sp||xe!==ip||Ut!==Qy){let xt=xe!==ip;Wi&&(Ro(Wi),Wi=null);let _t=xe?ge.byId.get(xe):void 0;_t&&(Wi=a_(_t,sI,Ut)),ip=xe,Qy=Ut,sp=!1,ap=re,CA(_t,Ut),_t&&xt&&!y&&wo(_t.x,_t.y,_t.z),Ln=!0}let Ze=Wi!==null&&Wi.hasLines&&(re-ap)/Y.sweep.fill<2;Wi&&Wi.hasLines&&(Wi.sweep.y=Math.min(2,(re-ap)/Y.sweep.fill)*1.07);let gt=xe?1:0,yt=Oa;if(Oa+=(gt-Oa)*(1-Math.pow(1-Y.focusEase,st*60)),Math.abs(gt-Oa)<.002&&(Oa=gt),C.uFocusAmt.value=Oa,!Xi&&dt.thinking&&Ut&&ge.connected.length){if(re>=Ky&&Eo<La.thinkSweeps){let xt=wA(),_t=xt?a_(xt,Fy,!0):null;xt&&_t&&_t.hasLines?(_t.dur=Y.think.life+Math.random()*Y.think.lifeJitter,Eo++,!y&&re-jy>Y.think.waveGap&&(jy=re,wo(xt.x,xt.y,xt.z))):_t&&Ro(_t),Ky=re+Y.think.every+Math.random()*Y.think.jitter}}else Eo&&!dt.thinking&&r_();for(let xt=0;xt<I.length;xt++){let _t=I[xt];if(_t.mode!==Fy)continue;let It=re-_t.start;if(It>=_t.dur){Ro(_t),Eo--;continue}let Zt=It/_t.dur,be=Zt<Y.think.hold?1:1-(Zt-Y.think.hold)/(1-Y.think.hold);_t.markerMat.opacity=be,_t.sweep.y=It/Y.sweep.thinkFill*1.07,_t.sweep.z=be}for(dt.highlightedNoteIds!==ea&&(ea=dt.highlightedNoteIds,RA(!0),Ln=!0);Ao<To&&re>=Jy+Ao*Y.think.citedGap;){let xt=Xu[Ao++];xt&&wo(xt.x,xt.y,xt.z)}if(ht){if(re>=qy){let xt=ge.placed.length;if(xt){let _t=ge.placed[Math.random()*xt|0];wo(_t.x,_t.y,_t.z)}qy=re+1/Y.motion.waves*(.6+Math.random()*.8)}if(Mo<0&&re>=Yy&&(wo(ge.core[0],ge.core[1],ge.core[2]),Yy=re+Y.motion.heart),re>=Zy){for(let xt=0;xt<X.length;xt++){let _t=X[xt];if(_t.alive)continue;let It=Math.random()*(ft.edges.length/2)|0,Zt=ft.edges[It*2],be=ft.edges[It*2+1];if(Math.random()<.5){let Se=Zt;Zt=be,be=Se}_t.alive=!0,_t.start=re,_t.dur=H.life+Math.random()*H.lifeJitter,_t.ax=Ht[Zt*3],_t.ay=Ht[Zt*3+1],_t.az=Ht[Zt*3+2],_t.bx=Ht[be*3],_t.by=Ht[be*3+1],_t.bz=Ht[be*3+2];break}Zy=re+H.every+Math.random()*H.jitter}}{let xt=0;for(let _t=0;_t<X.length;_t++){let It=X[_t];if(!It.alive)continue;let Zt=(re-It.start)/It.dur;if(Zt>=1||Zt<0||y){It.alive=!1;continue}let be=Math.sin(Math.PI*Zt);for(let Se=0;Se<H.tail;Se++){let mn=Zt-Se*H.tailGap,yn=mn<0?0:mn;z[xt*3]=As(It.ax,It.bx,yn),z[xt*3+1]=As(It.ay,It.by,yn),z[xt*3+2]=As(It.az,It.bz,yn),pt[xt*4]=kt,pt[xt*4+1]=De,pt[xt*4+2]=Be,pt[xt*4+3]=(mn>=0?be:0)*(1-Se/H.tail),xt++}}(xt>0||Fe>0)&&(Ct.needsUpdate=!0,Pt.needsUpdate=!0,At.setDrawRange(0,xt),Qt.visible=xt>0,Fe=xt)}if(!y||Ln||Oa!==yt||Ze||Eo>0||re<np){Ln=!1;let xt=y?0:Math.sin(re*1.1),_t=1-Y.focusDim*.55*Oa;Bt.uniforms.uOpacity.value=(_e+(N&&!y?Y.wire.breathe*Math.sin(re*1.1+1):0))*_t;for(let Se=0;Se<Q.length;Se++)Q[Se].u.value=Q[Se].base*_t;if(L){let Se=Nt.position.x-Vt.target.x,mn=Nt.position.y-Vt.target.y,yn=Nt.position.z-Vt.target.z,Ia=mn/(Math.hypot(Se,mn,yn)||1);L.opacity=bt.floor.opacity*(1+bt.floor.breathe*xt)*(1-vA(bt.floor.fadeFrom,bt.floor.fadeTo,Ia))}ae&&(ae.strength=Y.bloom.strength+Y.bloom.breathe*xt);let It=qu.elements,Zt=Nt.matrixWorldInverse.elements,be=It[3]*rt+It[7]*Rt+It[11]*St+It[15]||1;if(Xe.uCenterUv.value.set((It[0]*rt+It[4]*Rt+It[8]*St+It[12])/be*.5+.5,(It[1]*rt+It[5]*Rt+It[9]*St+It[13])/be*.5+.5),Xe.uAspect.value=$/B,k>0){let Se=It[3]*rt+It[7]*w+It[11]*St+It[15];Se>.05?(Xe.uCore.value.set((It[0]*rt+It[4]*w+It[8]*St+It[12])/Se*.5+.5,(It[1]*rt+It[5]*w+It[9]*St+It[13])/Se*.5+.5,V*Nt.projectionMatrix.elements[5]/(2*Se)),Xe.uCoreCol.value.copy(O).multiplyScalar(k*(1+.12*xt))):Xe.uCore.value.z=0}UA(Dt,Zt[2]*rt+Zt[6]*Rt+Zt[10]*St+Zt[14]),en.render(st),h.current=!0,qt||(qt=!0,Qt.visible=Fe>0)}oi||(oi=requestAnimationFrame(f_))},No=()=>{let U=p.current&&!document.hidden&&$>0&&B>0;U&&!oi?(wr=performance.now(),Ln=!0,oi=requestAnimationFrame(f_)):!U&&oi&&(cancelAnimationFrame(oi),oi=0)},d_=()=>{p.current||(p.current=!0,No())};No(),d.current={rebuildData:h_,syncLoop:No};let p_=new ResizeObserver(()=>{let U=g.clientWidth,st=g.clientHeight,dt=Math.min(window.devicePixelRatio||1,2);U===$&&st===B&&dt===K||($=U,B=st,dt!==K&&(K=dt,ct.setPixelRatio(K),en.setPixelRatio(K),C.uPx.value=K),$>0&&B>0&&(Nt.aspect=$/B,Nt.updateProjectionMatrix(),te(),ct.setSize($,B),Hn(),C.uRes.value.set($*K,B*K),C.uScale.value=B*K*.5,Ln=!0),No())});p_.observe(g);let m_=U=>{d_(),e_=U.clientX,n_=U.clientY,rp=!1,Wu=!0,Vt.autoRotate=!1},g_=U=>{d_(),Math.hypot(U.clientX-e_,U.clientY-n_)>4&&(rp=!0),!Wu&&($y=U.offsetX,t_=U.offsetY,_c=!0)},v_=U=>{if(Wu=!1,rp)return;let st=u_(U.offsetX,U.offsetY);if(!st){ta=null;return}(st.kind==="note"||st.kind==="section")&&st.noteId?u.current.onNodeActivate(st.noteId,st.sectionId,U.clientX,U.clientY):st.kind==="group"?u.current.onOpenGroup(st.refId):ta=ta===st.id?null:st.id},y_=()=>{Wu=!1},__=()=>{Xi=null,_c=!1},x_=()=>{Ln=!0};Z.addEventListener("pointerdown",m_),Z.addEventListener("pointermove",g_),Z.addEventListener("pointerup",v_),Z.addEventListener("pointercancel",y_),Z.addEventListener("pointerleave",__),Vt.addEventListener("change",x_),document.addEventListener("visibilitychange",No),f.addEventListener("change",gp);let vp=window,Qu=null;return Qu={camera:Nt,controls:Vt,renderer:ct,scene:wt,composer:en,uniforms:C,mesh:ft,data:()=>ge,setTime:U=>{So=U,U!==null&&(re=U,C.uTime.value=U,Xe.uTime.value=U),Ln=!0},setHover:U=>{Xi=U!==null&&ge.byId.has(U)?U:null,_c=!1,Ln=!0},setRotate:U=>{Vt.autoRotate=U},fireWave:U=>{let st=ge.byId.get(U);st&&wo(st.x,st.y,st.z)},replay:s_,info:()=>{let U=0,st=0;for(let dt of I)dt.mode!==$d&&(U++,dt.hasLines&&(st+=dt.line.geometry.instanceCount));return{renderer:ct.info,dark:N,reduced:y,dpr:K,size:[$,B],time:re,layers:{wire:vt,dots:ie,farLines:$t,farDots:bt.far.count,motes:bt.motes.count,routes:Kn,dendrites:ri,synapses:wi.count,impulses:jn.count,nodes:T.count,cited:vc,sweeps:U,sweepSegments:st,sparks:Fe,labels:Ku}}}},vp.__nfBrain=Qu,Gy("brain:scene",S),()=>{oi&&cancelAnimationFrame(oi),oi=0,p_.disconnect(),Z.removeEventListener("pointerdown",m_),Z.removeEventListener("pointermove",g_),Z.removeEventListener("pointerup",v_),Z.removeEventListener("pointercancel",y_),Z.removeEventListener("pointerleave",__),Vt.removeEventListener("change",x_),document.removeEventListener("visibilitychange",No),f.removeEventListener("change",gp),Qu!==null&&vp.__nfBrain===Qu&&delete vp.__nfBrain,d.current=null,Vt.dispose();for(let U of Do)U&&U.el.remove();Co.parentNode===g&&g.removeChild(Co);for(let U of I)Ro(U);for(let U of[Te,wi,jn,T])it(U,null,0);for(let U of _)U.dispose();Ae.dispose(),ae&&ae.dispose(),en.dispose(),ct.dispose(),Z.parentNode===g&&g.removeChild(Z)}},[l]),(0,rs.useEffect)(()=>{d.current?.rebuildData(e)},[e]),(0,rs.useEffect)(()=>window.noteflow?.onWindowVisibility?.(g=>{p.current=g,d.current?.syncLoop()}),[]),(0,_A.jsx)("div",{ref:o,className:"absolute inset-0",style:{touchAction:"none"}})}var rs,_A,Y,pA,Nn,$d,sI,Fy,Hy,Vy,aI,rI,$s,tp,mA,gA,As,vA,oI,lI,cI,yA,xA=gn(()=>{rs=Uo(Io());Qs();vT();yT();_T();Ey();ST();wy();NT();FT();ZT();jT();Py();cA();_A=Uo(By()),Y=Qd,pA=[gc.group,gc.folder,gc.note,gc.section],Nn={skin:-20,farLines:-9,farDots:-8.9,motes:-8.8,floor:-8,wire:0,wireHidden:.1,dots:.2,dotsHidden:.3,synapses:.4,sparks:.5,routes:1,routesHidden:1.1,impulses:2,glow:2.1,sweeps:2.2,nodes:3,nodesHidden:3.1,marker:4},$d=0,sI=1,Fy=2,Hy=256,Vy="'Inter',system-ui,sans-serif",aI="var(--app-font-family,'JetBrains Mono','Fira Code','Cascadia Code',monospace)",rI=[`font-family:${aI};font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;`,`font-family:${Vy};font-size:10.5px;font-weight:500;`,`font-family:${Vy};font-size:11px;font-weight:400;`,`font-family:${Vy};font-size:10px;font-weight:400;`],$s=new En,tp=([e,t,n])=>new fe().setRGB(e/255,t/255,n/255),mA=e=>.2126*e.r+.7152*e.g+.0722*e.b,gA=e=>`rgb(${Math.round(e.r*255)} ${Math.round(e.g*255)} ${Math.round(e.b*255)})`,As=(e,t,n)=>e+(t-e)*n,vA=(e,t,n)=>{let i=Math.max(0,Math.min(1,(n-e)/(t-e)));return i*i*(3-2*i)};oI=()=>ky((e,t)=>{let n=e.createRadialGradient(t/2,t/2,0,t/2,t/2,t/2);n.addColorStop(0,"rgba(255,255,255,1)"),n.addColorStop(.45,"rgba(255,255,255,0.9)"),n.addColorStop(1,"rgba(255,255,255,0)"),e.fillStyle=n,e.fillRect(0,0,t,t)}),lI=()=>ky((e,t)=>{e.strokeStyle="rgba(255,255,255,1)",e.lineWidth=6,e.beginPath(),e.arc(t/2,t/2,t/2-7,0,Math.PI*2),e.stroke()}),cI=()=>ky((e,t)=>{let n=e.createRadialGradient(t/2,t/2,0,t/2,t/2,t/2);n.addColorStop(0,"rgba(255,255,255,1)"),n.addColorStop(.25,"rgba(255,255,255,0.42)"),n.addColorStop(.6,"rgba(255,255,255,0.1)"),n.addColorStop(1,"rgba(255,255,255,0)"),e.fillStyle=n,e.fillRect(0,0,t,t)});yA=uI});var hI=ls(()=>{var SA=Uo(Io()),MA=Uo(XM());Qs();xA();wy();var bA=null,Xy={showContentEdges:!0,onOpenNote(){},onOpenGroup(){},onNodeActivate(){}},Wy=new W,EA={mount(e,t){bA=(0,MA.createRoot)(e),EA.update(t)},update(e){Xy={...Xy,...e},bA?.render((0,SA.createElement)(yA,Xy))},setTheme:TT,handle:()=>window.__nfBrain,project(e){let t=window.__nfBrain;if(!t)return null;let n=t.data().byId.get(e);if(!n)return null;let i=t.renderer.domElement,s=i.clientWidth,a=i.clientHeight;Wy.set(n.x,n.y,n.z).project(t.camera);let r=t.controls.target,o=t.camera.position,l=(n.x-r.x)*(o.x-r.x)+(n.y-r.y)*(o.y-r.y)+(n.z-r.z)*(o.z-r.z)>0;return{x:(Wy.x*.5+.5)*s,y:(-Wy.y*.5+.5)*a,front:l}}};window.NFBrain=EA});hI();})();
/*! Bundled license information:

react/cjs/react.production.js:
  (**
   * @license React
   * react.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

scheduler/cjs/scheduler.production.js:
  (**
   * @license React
   * scheduler.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-dom/cjs/react-dom.production.js:
  (**
   * @license React
   * react-dom.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-dom/cjs/react-dom-client.production.js:
  (**
   * @license React
   * react-dom-client.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2024 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)

react/cjs/react-jsx-runtime.production.js:
  (**
   * @license React
   * react-jsx-runtime.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
