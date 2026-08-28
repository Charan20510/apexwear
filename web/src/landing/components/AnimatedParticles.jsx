import { useEffect, useRef } from "react";

function hexToRgb(hex) {
  let c = hex.replace("#", "").trim();
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16);
  if (isNaN(num)) return [1, 1, 1];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

function computeShapeTarget(targetShape, i, total, w, h) {
  const minDim = Math.min(w, h);
  const cx = w * 0.5, cy = h * 0.5;

  if (targetShape === "heart") {
    const t = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.35);
    const scale = minDim * 0.021 * r;
    const hx = 16 * Math.pow(Math.sin(t), 3) * scale;
    const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * scale;
    return [cx + hx, cy + hy + minDim * 0.03];
  }
  if (targetShape === "star") {
    const angle = Math.random() * Math.PI * 2;
    const points = 5, section = Math.PI / points;
    const aMod = ((angle % (section * 2)) + section * 2) % (section * 2);
    const rInner = 0.42, rOuter = 1.0;
    const t = aMod / section;
    const baseR = t < 1 ? rInner + (rOuter - rInner) * t : rOuter - (rOuter - rInner) * (t - 1);
    const volumeR = Math.pow(Math.random(), 0.45) * baseR;
    const scale = minDim * 0.38;
    return [cx + Math.cos(angle - Math.PI / 2) * volumeR * scale, cy + Math.sin(angle - Math.PI / 2) * volumeR * scale];
  }
  if (targetShape === "ring") {
    const angle = Math.random() * Math.PI * 2;
    const r = minDim * (0.33 + (Math.random() - 0.5) * 0.06);
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  }
  if (targetShape === "diamond") {
    const u = (Math.random() - 0.5) * 2.0;
    const maxV = 1.0 - Math.abs(u);
    const v = (Math.random() - 0.5) * 2.0 * maxV;
    const scale = minDim * 0.38;
    return [cx + u * scale, cy + v * scale * 1.15];
  }
  if (targetShape === "spiral") {
    const arm = Math.random() > 0.5 ? 0 : Math.PI;
    const r = Math.pow(Math.random(), 0.55) * minDim * 0.42;
    const theta = (r / minDim) * 12.0 + arm + (Math.random() - 0.5) * 0.22;
    return [cx + Math.cos(theta) * r, cy + Math.sin(theta) * r];
  }
  if (targetShape === "butterfly") {
    const t = (Math.random() - 0.5) * Math.PI * 2;
    const r = (Math.exp(Math.cos(t)) - 2 * Math.cos(4 * t) - Math.pow(Math.sin(t / 12), 5)) * (minDim * 0.08);
    return [cx + Math.sin(t) * r * Math.pow(Math.random(), 0.3), cy + -Math.cos(t) * r * Math.pow(Math.random(), 0.3)];
  }
  return [Math.random() * w, Math.random() * h];
}

const VERTEX_SHADER = `
attribute vec2 a_origin;
attribute vec2 a_position;
attribute float a_life;
attribute float a_maxLife;
attribute float a_shape;
attribute vec3 a_color;
uniform vec2 u_resolution;
uniform float u_particleSize;
uniform float u_particleOpacity;
varying vec2 v_texCoord;
varying float v_alpha;
varying float v_shape;
varying vec3 v_color;
void main() {
  v_texCoord = vec2(a_origin.x, 1.0 - a_origin.y);
  float lifeRatio = clamp(a_life / a_maxLife, 0.0, 1.0);
  v_alpha = sin(lifeRatio * 3.14159265) * u_particleOpacity;
  v_shape = a_shape;
  v_color = a_color;
  vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
  gl_PointSize = u_particleSize;
}
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D u_image;
uniform int u_useImage;
varying vec2 v_texCoord;
varying float v_alpha;
varying float v_shape;
varying vec3 v_color;
void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  int shapeType = int(floor(v_shape + 0.5));
  if (shapeType == 0) {
    if (dist > 0.5) discard;
  } else if (shapeType == 1) {
    float a = atan(coord.y, coord.x);
    float starDist = dist * (0.8 + 0.6 * pow(abs(sin(a * 2.0)), 0.5));
    if (starDist > 0.45) discard;
  } else if (shapeType == 2) {
    if (abs(coord.x) > 0.45 || abs(coord.y) > 0.45) discard;
  } else if (shapeType == 3) {
    if (abs(coord.x) + abs(coord.y) > 0.5) discard;
  } else if (shapeType == 4) {
    if (dist > 0.5 || dist < 0.22) discard;
  } else if (shapeType == 5) {
    bool horiz = abs(coord.y) < 0.16 && abs(coord.x) < 0.48;
    bool vert  = abs(coord.x) < 0.16 && abs(coord.y) < 0.48;
    if (!horiz && !vert) discard;
  }
  vec4 baseColor;
  if (u_useImage == 1) {
    baseColor = texture2D(u_image, v_texCoord);
    if (baseColor.a < 0.05) discard;
  } else {
    baseColor = vec4(v_color, 1.0);
  }
  gl_FragColor = vec4(baseColor.rgb, baseColor.a * v_alpha);
}
`;

export default function AnimatedParticles({
  className = "",
  children,
  shape = "random",
  glyph = "random",
  colors = ["#334155", "#475569", "#64748b", "#1e293b"],
  backgroundColor = "#ffffff",
  particleCount = 16000,
  particleSize = 2.2,
  particleOpacity = 0.5,
  speed = 0.7,
  noiseScale = 0.004,
  noiseStrength = 0.06,
  springStiffness = 0.045,
  lifespan = 240,
  damping = 0.95,
  interactive = true,
  cursorMode = "disperse",
  cursorStrength = 0.15,
  cursorRadius = 140,
}) {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999, vx: 0, vy: 0, active: false });

  // Mount-only: prop deps would tear down and rebuild the whole GPU pipeline on every change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    if (!gl) return;

    const mkShader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("[AnimatedParticles] Shader error:", gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    };
    const vert = mkShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const frag = mkShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vert || !frag) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[AnimatedParticles] Link error:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const aOrigin   = gl.getAttribLocation(prog, "a_origin");
    const aPosition = gl.getAttribLocation(prog, "a_position");
    const aLife     = gl.getAttribLocation(prog, "a_life");
    const aMaxLife  = gl.getAttribLocation(prog, "a_maxLife");
    const aShape    = gl.getAttribLocation(prog, "a_shape");
    const aColor    = gl.getAttribLocation(prog, "a_color");
    const uRes      = gl.getUniformLocation(prog, "u_resolution");
    const uPSize    = gl.getUniformLocation(prog, "u_particleSize");
    const uPOpacity = gl.getUniformLocation(prog, "u_particleOpacity");
    const uUseImage = gl.getUniformLocation(prog, "u_useImage");

    const count = Math.max(1000, Math.min(100000, particleCount));
    const origins    = new Float32Array(count * 2);
    const positions  = new Float32Array(count * 2);
    const targets    = new Float32Array(count * 2);
    const velocities = new Float32Array(count * 2);
    const lives      = new Float32Array(count);
    const maxLives   = new Float32Array(count);
    const shapes     = new Float32Array(count);
    const colorAttrs = new Float32Array(count * 3);

    const parsedColors = colors.map(hexToRgb);

    const glyphIndex = (g) => {
      switch (g) {
        case "circle": return 0; case "star": return 1; case "square": return 2;
        case "diamond": return 3; case "ring": return 4; case "cross": return 5;
        default: return Math.floor(Math.random() * 6);
      }
    };

    const initParticle = (i, w, h, respawnOnly = false) => {
      const [tx, ty] = computeShapeTarget(shape, i, count, w, h);
      targets[i * 2] = tx; targets[i * 2 + 1] = ty;
      origins[i * 2] = tx / Math.max(1, w); origins[i * 2 + 1] = ty / Math.max(1, h);
      if (!respawnOnly) {
        if (shape === "random") {
          positions[i * 2] = Math.random() * w; positions[i * 2 + 1] = Math.random() * h;
          velocities[i * 2] = (Math.random() - 0.5) * 1.5; velocities[i * 2 + 1] = (Math.random() - 0.5) * 1.5;
        } else {
          positions[i * 2] = tx + (Math.random() - 0.5) * 20; positions[i * 2 + 1] = ty + (Math.random() - 0.5) * 20;
          velocities[i * 2] = (Math.random() - 0.5) * 0.4; velocities[i * 2 + 1] = (Math.random() - 0.5) * 0.4;
        }
      } else if (shape === "random") {
        positions[i * 2] = Math.random() * w; positions[i * 2 + 1] = Math.random() * h;
      }
      const mLife = lifespan * (0.8 + Math.random() * 0.4);
      maxLives[i] = mLife; lives[i] = Math.random() * mLife;
      shapes[i] = glyphIndex(glyph);
      const rgb = parsedColors[Math.floor(Math.random() * parsedColors.length)] || [1, 1, 1];
      colorAttrs[i * 3] = rgb[0]; colorAttrs[i * 3 + 1] = rgb[1]; colorAttrs[i * 3 + 2] = rgb[2];
    };

    const oBuf = gl.createBuffer(), pBuf = gl.createBuffer(), lBuf = gl.createBuffer(),
          mlBuf = gl.createBuffer(), shBuf = gl.createBuffer(), cBuf = gl.createBuffer();

    const bgRgb = hexToRgb(backgroundColor);
    const isRandom = shape === "random";
    let time = 0;
    let rafId;
    let cancelled = false;

    const renderFrame = () => {
      if (!canvas || !gl || cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const dw = Math.floor(canvas.clientWidth * dpr);
      const dh = Math.floor(canvas.clientHeight * dpr);

      if (canvas.width !== dw || canvas.height !== dh) {
        canvas.width = dw; canvas.height = dh;
        gl.viewport(0, 0, dw, dh);
        for (let i = 0; i < count; i++) initParticle(i, dw, dh, false);
      }

      time += 0.01 * speed;
      const spring = isRandom ? 0 : springStiffness;

      for (let i = 0; i < count; i++) {
        lives[i] += 1;
        if (lives[i] >= maxLives[i]) initParticle(i, dw, dh, true);

        const px = positions[i * 2], py = positions[i * 2 + 1];
        const tx = targets[i * 2],   ty = targets[i * 2 + 1];
        let fx = (tx - px) * spring, fy = (ty - py) * spring;

        const angle = Math.sin(px * noiseScale + time) * Math.cos(py * noiseScale + time) * Math.PI * 2;
        const curlMag = isRandom ? noiseStrength * 2.2 : noiseStrength * 0.4;
        fx += Math.cos(angle) * curlMag;
        fy += Math.sin(angle) * curlMag;

        velocities[i * 2]     = (velocities[i * 2]     + fx) * damping;
        velocities[i * 2 + 1] = (velocities[i * 2 + 1] + fy) * damping;

        if (interactive && mouseRef.current.active) {
          const dx = px - mouseRef.current.x, dy = py - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < cursorRadius && dist > 0) {
            const factor = (1 - dist / cursorRadius) * cursorStrength;
            if (cursorMode === "disperse") {
              velocities[i * 2]     += (dx / dist) * factor * 16 + mouseRef.current.vx * factor * 0.8;
              velocities[i * 2 + 1] += (dy / dist) * factor * 16 + mouseRef.current.vy * factor * 0.8;
            } else if (cursorMode === "attract") {
              velocities[i * 2]     += -(dx / dist) * factor * 12;
              velocities[i * 2 + 1] += -(dy / dist) * factor * 12;
            } else {
              velocities[i * 2]     += (-dy / dist) * factor * 14;
              velocities[i * 2 + 1] += ( dx / dist) * factor * 14;
            }
          }
        }

        positions[i * 2]     += velocities[i * 2];
        positions[i * 2 + 1] += velocities[i * 2 + 1];

        if (isRandom) {
          if (positions[i * 2] < -20)       positions[i * 2] = dw + 20;
          else if (positions[i * 2] > dw + 20) positions[i * 2] = -20;
          if (positions[i * 2 + 1] < -20)       positions[i * 2 + 1] = dh + 20;
          else if (positions[i * 2 + 1] > dh + 20) positions[i * 2 + 1] = -20;
        }
      }

      gl.clearColor(bgRgb[0], bgRgb[1], bgRgb[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(uRes, dw, dh);
      gl.uniform1f(uPSize, particleSize);
      gl.uniform1f(uPOpacity, particleOpacity);
      gl.uniform1i(uUseImage, 0);

      const upload = (buf, data, loc, size) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      };
      upload(oBuf, origins, aOrigin, 2);
      upload(pBuf, positions, aPosition, 2);
      upload(lBuf, lives, aLife, 1);
      upload(mlBuf, maxLives, aMaxLife, 1);
      upload(shBuf, shapes, aShape, 1);
      upload(cBuf, colorAttrs, aColor, 3);
      gl.drawArrays(gl.POINTS, 0, count);

      mouseRef.current.vx *= 0.88;
      mouseRef.current.vy *= 0.88;

      rafId = requestAnimationFrame(renderFrame);
    };

    const dpr0 = Math.min(window.devicePixelRatio || 1, 2);
    const iw = (canvas.clientWidth || window.innerWidth) * dpr0;
    const ih = (canvas.clientHeight || window.innerHeight) * dpr0;
    for (let i = 0; i < count; i++) initParticle(i, iw, ih, false);

    rafId = requestAnimationFrame(renderFrame);

    const onWindowMouseMove = (e) => {
      if (!interactive) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nx = (e.clientX - rect.left) * dpr;
      const ny = (e.clientY - rect.top) * dpr;
      const inBounds = nx >= 0 && ny >= 0 && nx <= rect.width * dpr && ny <= rect.height * dpr;
      if (!inBounds) { mouseRef.current.active = false; return; }
      if (mouseRef.current.x !== -9999) {
        mouseRef.current.vx = nx - mouseRef.current.x;
        mouseRef.current.vy = ny - mouseRef.current.y;
      }
      mouseRef.current.x = nx; mouseRef.current.y = ny; mouseRef.current.active = true;
    };
    window.addEventListener("mousemove", onWindowMouseMove, { passive: true });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onWindowMouseMove);
      gl.deleteProgram(prog);
      gl.deleteShader(vert); gl.deleteShader(frag);
      [oBuf, pBuf, lBuf, mlBuf, shBuf, cBuf].forEach((b) => gl.deleteBuffer(b));
    };
  }, []);

  return (
    <div
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden" }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }}
      />
      {children && <div style={{ position: "relative", zIndex: 10, width: "100%", height: "100%" }}>{children}</div>}
    </div>
  );
}
