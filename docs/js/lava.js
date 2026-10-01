/* Yoergoods Digital - "lava" hero texture
   A dark, glossy, flowing grain rendered with a small WebGL shader: domain-warped noise, thin ridges,
   and a specular highlight so it reads like polished dark wood or cooled lava. Exposes:
     YGLava.renderOnce(canvas, time)  -> draws one frame (used by the build to bake a JPG)
     YGLava.mount(canvas, opts)       -> animates slowly, pauses offscreen / when hidden, returns a stop() */
(function () {
  'use strict';
  var FRAG = [
    'precision highp float;',
    'uniform vec2 u_res; uniform float u_time;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
    'float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);',
    '  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x), f.y); }',
    'float fbm(vec2 p){ float v=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ v+=a*noise(p); p=m*p; a*=.5; } return v; }',
    'float field(vec2 s, float t){',
    '  vec2 q = vec2(fbm(s*0.9 + t), fbm(s*0.9 + vec2(5.2,1.3) - t*0.7));',
    '  vec2 r = vec2(fbm(s + 2.2*q + vec2(1.7,9.2)), fbm(s + 2.2*q + vec2(8.3,2.8)));',
    '  float h = fbm(s + 1.6*r);',
    '  float lines = sin((s.y*3.4 + r.y*3.2 + h*3.6));',
    '  return h*0.5 + 0.5*pow(1.0 - abs(lines), 1.7);',
    '}',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy/u_res.xy;',
    '  float aspect = u_res.x/u_res.y;',
    '  vec2 p = vec2((uv.x-0.5)*aspect, uv.y-0.5);',
    '  float ang = -0.42; mat2 rot = mat2(cos(ang),-sin(ang),sin(ang),cos(ang));',
    '  vec2 s = rot*p; s.x *= 0.5; s *= 2.2;',
    '  float t = u_time*0.02;',
    '  float e = 0.012;',
    '  float h  = field(s, t);',
    '  float hx = field(s + vec2(e,0.), t);',
    '  float hy = field(s + vec2(0.,e), t);',
    '  vec3 n = normalize(vec3((h-hx)/e*0.07, (h-hy)/e*0.07, 1.0));',
    '  vec3 L = normalize(vec3(-0.55, 0.65, 0.55));',
    '  float diff = clamp(dot(n, L), 0.0, 1.0);',
    '  vec3 V = vec3(0.,0.,1.); vec3 H = normalize(L+V);',
    '  float spec = pow(clamp(dot(n,H),0.,1.), 18.0);',
    '  float ridge = smoothstep(0.5, 0.92, h);',
    '  float lit = smoothstep(0.25, 0.75, fbm(p*0.9 + vec2(2.0,7.0) + t*0.3));',
    '  vec3 dark  = vec3(0.028,0.034,0.048);',
    '  vec3 umber = vec3(0.27,0.165,0.095);',
    '  vec3 warm  = vec3(0.70,0.47,0.22);',
    '  vec3 col = mix(dark, umber, smoothstep(0.3,0.8,h)*(0.45+0.55*diff)*(0.35+0.65*lit));',
    '  col = mix(col, warm, ridge*diff*(0.35+0.65*lit)*1.05);',
    '  col += vec3(0.95,0.72,0.38)*spec*(0.3+0.7*ridge)*(0.4+0.6*lit)*0.9;',
    '  float vig = smoothstep(1.35, 0.3, length(p*vec2(0.9,1.25)));',
    '  col *= mix(0.42, 1.0, vig);',
    '  col = mix(col, vec3(0.043,0.078,0.125), 0.12);',
    '  gl_FragColor = vec4(col,1.0);',
    '}'
  ].join('\n');
  var VERT = 'attribute vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }';

  function setup(canvas) {
    var gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' }) || canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
    if (!gl) return null;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    return { gl: gl, uRes: gl.getUniformLocation(prog, 'u_res'), uTime: gl.getUniformLocation(prog, 'u_time') };
  }
  function draw(ctx, canvas, time) {
    var gl = ctx.gl;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(ctx.uRes, canvas.width, canvas.height);
    gl.uniform1f(ctx.uTime, time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function renderOnce(canvas, time) {
    try { var ctx = setup(canvas); if (!ctx) return false; draw(ctx, canvas, time || 0); ctx.gl.finish(); return true; } catch (e) { return false; }
  }
  function mount(canvas, opts) {
    opts = opts || {};
    var scale = opts.scale || 0.5, ctx;
    try { ctx = setup(canvas); } catch (e) { ctx = null; }
    if (!ctx) return null;
    var running = false, visible = true, raf = 0, start = (opts.startTime || 7.0), t0 = performance.now();
    function size() {
      var w = Math.max(2, Math.round(canvas.clientWidth * scale)), h = Math.max(2, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    function frame(now) {
      if (!running) return;
      size();
      draw(ctx, canvas, start + (now - t0) / 1000);
      raf = requestAnimationFrame(frame);
    }
    function play() { if (!running && visible && !document.hidden) { running = true; raf = requestAnimationFrame(frame); } }
    function pause() { running = false; if (raf) cancelAnimationFrame(raf); }
    var io = null;
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) play(); else pause(); }, { threshold: 0 });
      io.observe(canvas);
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else play(); });
    window.addEventListener('resize', size);
    size(); draw(ctx, canvas, start); play();
    return function stop() { pause(); if (io) io.disconnect(); };
  }
  window.YGLava = { renderOnce: renderOnce, mount: mount };
})();
