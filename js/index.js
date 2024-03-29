const fragment = `
#ifdef GL_ES
  precision mediump float;
#endif

uniform vec4 resolution;
uniform vec2 mouse;
uniform vec2 threshold;
uniform float time;
uniform float pixelRatio;
uniform sampler2D image0;
uniform sampler2D image1;


vec2 mirrored(vec2 v) {
  vec2 m = mod(v,2.);
  return mix(m,2.0 - m, step(1.0 ,m));
}

void main() {
  // uvs and textures
  vec2 uv = pixelRatio*gl_FragCoord.xy / resolution.xy ;
  vec2 vUv = (uv - vec2(0.5))*resolution.zw + vec2(0.5);
  vUv.y = 1. - vUv.y;
  vec4 tex1 = texture2D(image1,mirrored(vUv));
  vec2 fake3d = vec2(vUv.x + (tex1.r - 0.5)*mouse.x/threshold.x, vUv.y + (tex1.r - 0.5)*mouse.y/threshold.y);
  gl_FragColor = texture2D(image0,mirrored(fake3d));
}`;
const vertex = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4( a_position, 0, 1 );
}`;
export default class Fake3D {
    constructor(options) {
        this.imageAspect = 0;
        this.maxTilt = 0;
        this.program = null;
        this.options = Object.assign(Object.assign({}, {
            glID: "gl",
            rootID: "root",
            horizontalThreshold: 35,
            verticalThreshold: 15,
            inertia: 0.1,
            homeInertia: 0.15,
            homeBufferSize: 25,
            homeVariance: 0.01,
            gyroTilt: 11
        }), options);
        this.container = document.getElementById(this.options.glID);
        this.canvas = document.createElement("canvas");
        this.container.appendChild(this.canvas);
        this.gl = this.canvas.getContext("webgl");
        this.ratio = window.devicePixelRatio;
        this.windowWidth = window.innerWidth;
        this.windowHeight = window.innerHeight;
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseTargetX = 0;
        this.mouseTargetY = 0;
        this.imageOriginal = this.options.imageOriginal;
        this.imageDepth = this.options.imageDepth;
        // See https://huggingface.co/spaces/shariqfarooq/ZoeDepth to create a depth map
        this.imageURLs = [
            this.imageOriginal,
            this.imageDepth
        ];
        this.textures = [];
        this.startTime = new Date().getTime();
    }
    magic(logger = null) {
        this.logger = logger;
        this.startTime = new Date().getTime();
        this.createScene();
        this.addTexture();
        this.mouseMove();
        this.gyro();
    }
    addShader(source, type) {
        let shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        let isCompiled = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS);
        if (!isCompiled) {
            throw new Error('Shader compile error: ' + this.gl.getShaderInfoLog(shader));
        }
        this.gl.attachShader(this.program, shader);
    }
    resizeHandler() {
        this.windowWidth = window.innerWidth;
        this.windowHeight = window.innerHeight;
        this.width = this.container.offsetWidth;
        this.height = this.container.offsetHeight;
        this.canvas.width = this.width * this.ratio;
        this.canvas.height = this.height * this.ratio;
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
        let a1, a2;
        if (this.height / this.width < this.imageAspect) {
            a1 = 1;
            a2 = (this.height / this.width) / this.imageAspect;
        }
        else {
            a1 = (this.width / this.height) * this.imageAspect;
            a2 = 1;
        }
        this.uResolution.set(this.width, this.height, a1, a2);
        this.uRatio.set(1 / this.ratio);
        this.uThreshold.set(this.options.horizontalThreshold, this.options.verticalThreshold);
        this.gl.viewport(0, 0, this.width * this.ratio, this.height * this.ratio);
    }
    resize() {
        this.resizeHandler();
        window.addEventListener('resize', this.resizeHandler.bind(this));
    }
    createScene() {
        this.program = this.gl.createProgram();
        this.addShader(vertex, this.gl.VERTEX_SHADER);
        this.addShader(fragment, this.gl.FRAGMENT_SHADER);
        this.gl.linkProgram(this.program);
        this.gl.useProgram(this.program);
        this.uResolution = new Uniform('resolution', '4f', this.program, this.gl);
        this.uMouse = new Uniform('mouse', '2f', this.program, this.gl);
        this.uTime = new Uniform('time', '1f', this.program, this.gl);
        this.uRatio = new Uniform('pixelRatio', '1f', this.program, this.gl);
        this.uThreshold = new Uniform('threshold', '2f', this.program, this.gl);
        // create position attrib
        this.billboard = new Rect(this.gl);
        this.positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
        this.gl.enableVertexAttribArray(this.positionLocation);
        this.gl.vertexAttribPointer(this.positionLocation, 2, this.gl.FLOAT, false, 0, 0);
    }
    addTexture() {
        loadImages(this.imageURLs, this.start.bind(this));
    }
    start(images) {
        let that = this;
        let gl = that.gl;
        this.imageAspect = images[0].naturalHeight / images[0].naturalWidth;
        for (var i = 0; i < images.length; i++) {
            let texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            // Set the parameters so we can render any size image.
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            // Upload the image into the texture.
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[i]);
            this.textures.push(texture);
        }
        // lookup the sampler locations.
        let u_image0Location = this.gl.getUniformLocation(this.program, 'image0');
        let u_image1Location = this.gl.getUniformLocation(this.program, 'image1');
        // set which texture units to render with.
        this.gl.uniform1i(u_image0Location, 0); // texture unit 0
        this.gl.uniform1i(u_image1Location, 1); // texture unit 1
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[0]);
        this.gl.activeTexture(this.gl.TEXTURE1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[1]);
        // start application
        this.resize();
        this.render();
    }
    gyro() {
        let beta0 = null;
        let gamma0 = null;
        let currentbeta0 = null;
        let currentgamma0 = null;
        let granted = false;
        let index = 0;
        const homeBufferSize = this.options.homeBufferSize;
        const xs = new Array(homeBufferSize).fill(0);
        const ys = new Array(homeBufferSize).fill(0);
        const me = this;
        window.addEventListener('deviceorientation', handleOrientation);
        function handleOrientation(event) {
            if (event == undefined || event.alpha == undefined || event.beta == undefined || event.gamma == undefined)
                return;
            const alpha = event.alpha;
            const beta = event.beta;
            const gamma = event.gamma;
            xs[index] = beta;
            ys[index] = gamma;
            index = (index + 1) % homeBufferSize;
            const averageX = calculateMean(xs);
            const varianceX = calculateVariance(xs, averageX);
            const averageY = calculateMean(ys);
            const varianceY = calculateVariance(ys, averageY);
            if (varianceX < me.options.homeVariance && varianceY < me.options.homeVariance) {
                beta0 = averageX;
                gamma0 = averageY;
            }
            if (beta0 == null)
                beta0 = beta;
            if (gamma0 == null)
                gamma0 = gamma;
            if (currentbeta0 == null)
                currentbeta0 = beta0;
            if (currentgamma0 == null)
                currentgamma0 = gamma0;
            // inertia
            currentbeta0 += (beta0 - currentbeta0) * me.options.homeInertia;
            currentgamma0 += (gamma0 - currentgamma0) * me.options.homeInertia;
            const x = beta - currentbeta0;
            const y = gamma - currentgamma0;
            const maxTiltX = me.options.gyroTilt;
            const maxTiltY = me.options.gyroTilt;
            me.mouseTargetX = clamp(x, -maxTiltX, maxTiltX) / maxTiltX;
            me.mouseTargetY = -clamp(y, -maxTiltY, maxTiltY) / maxTiltY;
            if (me.logger) {
                const markup = `ɑ=${toFixed2(alpha)} β=${toFixed2(beta)} γ=${toFixed2(gamma)} x=${toFixed2(x)} y=${toFixed2(y)}<br>
                mouxex=${toFixed2(me.mouseTargetX)} mousey=${toFixed2(me.mouseTargetY)}<br>
                avgx=${toFixed2(averageX)} varx=${toFixed2(varianceX)} index=${index}<br>
                avgy=${toFixed2(averageY)} vary=${toFixed2(varianceY)}`;
                me.logger(markup);
            }
        }
        // Handle security on iOS 13+ devices
        const root = document.getElementById(this.options.rootID);
        root.addEventListener("click", () => {
            beta0 = null;
            gamma0 = null;
            if (granted) {
                window.removeEventListener('devicemotion', handleOrientation);
                granted = false;
            }
            else {
                if (typeof DeviceMotionEvent.requestPermission === 'function') {
                    DeviceMotionEvent.requestPermission()
                        .then((state) => {
                        if (state === 'granted') {
                            granted = true;
                            window.addEventListener('devicemotion', handleOrientation);
                        }
                        else
                            console.error('Request to access the orientation was rejected');
                    })
                        .catch(console.error);
                }
                else {
                    window.addEventListener('devicemotion', handleOrientation);
                }
            }
        });
    }
    mouseMove() {
        let me = this;
        document.addEventListener('mousemove', function (e) {
            let halfX = me.windowWidth / 2;
            let halfY = me.windowHeight / 2;
            me.mouseTargetX = (halfX - e.clientX) / halfX;
            me.mouseTargetY = (halfY - e.clientY) / halfY;
        });
    }
    render() {
        let now = new Date().getTime();
        let currentTime = (now - this.startTime) / 1000;
        this.uTime.set(currentTime);
        // inertia
        let x = this.mouseX += (this.mouseTargetX - this.mouseX) * this.options.inertia;
        let y = this.mouseY += (this.mouseTargetY - this.mouseY) * this.options.inertia;
        const radius = Math.sqrt((x * x) + (y * y));
        if (radius > 1) {
            x = x / radius;
            y = y / radius;
        }
        this.uMouse.set(x, y);
        this.uThreshold.set(this.options.horizontalThreshold, this.options.verticalThreshold);
        // render
        this.billboard.render(this.gl);
        requestAnimationFrame(this.render.bind(this));
    }
    static fetchState() {
        const storage = localStorage.getItem("fake3d_options");
        if (storage)
            return JSON.parse(storage);
        return null;
    }
    static saveState(options) {
        localStorage.setItem("fake3d_options", JSON.stringify(options));
    }
}
class Uniform {
    constructor(name, suffix, program, gl) {
        this.name = name;
        this.suffix = suffix;
        this.gl = gl;
        this.program = program;
        this.location = gl.getUniformLocation(program, name);
    }
    set(...values) {
        let method = 'uniform' + this.suffix;
        let args = [this.location].concat(values);
        this.gl[method].apply(this.gl, args);
    }
}
class Rect {
    constructor(gl) {
        var buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, Rect.verts, gl.STATIC_DRAW);
    }
    render(gl) {
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}
Rect.verts = new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, 1,
]);
function loadImage(url, callback) {
    var image = new Image();
    image.src = url;
    image.onload = callback;
    return image;
}
function loadImages(urls, callback) {
    var images = [];
    var imagesToLoad = urls.length;
    // Called each time an image finished loading.
    var onImageLoad = function () {
        --imagesToLoad;
        // If all the images are loaded call the callback.
        if (imagesToLoad === 0) {
            callback(images);
        }
    };
    for (var ii = 0; ii < imagesToLoad; ++ii) {
        var image = loadImage(urls[ii], onImageLoad);
        images.push(image);
    }
}
function clamp(numba, lower, upper) {
    if (numba != undefined) {
        if (upper != undefined) {
            numba = numba <= upper ? numba : upper;
        }
        if (lower != undefined) {
            numba = numba >= lower ? numba : lower;
        }
    }
    return numba;
}
const calculateMean = (values) => {
    if (values.length == 0)
        return 0;
    return (values.reduce((sum, current) => sum + current)) / values.length;
};
const calculateVariance = (values, average) => {
    const squareDiffs = values.map((value) => {
        const diff = value - average;
        return diff * diff;
    });
    const variance = calculateMean(squareDiffs);
    return variance;
};
const toFixed2 = (numba) => {
    const fixed = numba.toFixed(2);
    return (fixed[0] == "-" ? fixed : "+" + fixed);
};
//# sourceMappingURL=index.js.map