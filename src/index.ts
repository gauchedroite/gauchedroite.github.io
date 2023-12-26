
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
}`

const vertex = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4( a_position, 0, 1 );
}`


class Fake3D {
    container: HTMLElement;
    canvas: HTMLCanvasElement;
    gl: WebGLRenderingContext;
    ratio: number;
    windowWidth: number;
    windowHeight: number;
    mouseX: number;
    mouseY: number;
    mouseTargetX: number;
    mouseTargetY: number;
    imageOriginal: any;
    imageDepth: any;
    vth: any;
    hth: any;
    imageURLs: any[];
    textures: any[];
    startTime: number;
    width: any;
    height: any;
    imageAspect: number = 0;
    uResolution: any;
    uRatio: any;
    uThreshold: any;
    uMouse: any;
    uTime: any;
    billboard: any;
    positionLocation: any;
    maxTilt: number = 0;
    program: WebGLProgram | null = null;

    constructor() {
        this.container = document.getElementById('gl')!;
        this.canvas = document.createElement('canvas');
        this.container.appendChild(this.canvas);
        this.gl = this.canvas.getContext('webgl')!;
        this.ratio = window.devicePixelRatio;
        this.windowWidth = window.innerWidth;
        this.windowHeight = window.innerHeight;
        this.mouseX = 0;
        this.mouseY = 0;

        this.mouseTargetX = 0;
        this.mouseTargetY = 0;

        this.imageOriginal = this.container.getAttribute('data-imageOriginal');
        this.imageDepth = this.container.getAttribute('data-imageDepth');
        this.vth = this.container.getAttribute('data-verticalThreshold');
        this.hth = this.container.getAttribute('data-horizontalThreshold');

        this.imageURLs = [
            this.imageOriginal,
            this.imageDepth
        ];
        this.textures = [];


        this.startTime = new Date().getTime(); // Get start time for animating

        this.createScene();
        this.addTexture();
        this.mouseMove();
        this.gyro();
    }

    addShader(source: string, type: number) {
        let shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        let isCompiled = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS);
        if (!isCompiled) {
            throw new Error('Shader compile error: ' + this.gl.getShaderInfoLog(shader));
        }
        this.gl.attachShader(this.program!, shader);
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
        this.uThreshold.set(this.hth, this.vth);
        this.gl.viewport(0, 0, this.width * this.ratio, this.height * this.ratio);
    }

    resize() {
        this.resizeHandler();
        window.addEventListener('resize', this.resizeHandler.bind(this));
    }

    createScene() {
        this.program = this.gl.createProgram()!;

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
        let that = this;
        let gl = that.gl;
        loadImages(this.imageURLs, that.start.bind(this));
    }

    start(images: any) {
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
        let u_image0Location = this.gl.getUniformLocation(this.program!, 'image0');
        let u_image1Location = this.gl.getUniformLocation(this.program!, 'image1');

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
        const me = this;
        let gamma0: number | null = null;

        window.addEventListener('deviceorientation', handleOrientation);
        function handleOrientation(event: any) {

            if (event == undefined || event.alpha == undefined || event.beta == undefined || event.gamma == undefined)
                return

            const alpha: number = event.alpha;
            const beta: number = event.beta;
            const gamma: number = event.gamma;

            if (gamma0 == undefined)
                gamma0 = gamma;

            const maxTilt = 10;
            const x = beta;
            const y = gamma - gamma0!;

            me.mouseTargetX = -clamp(x, -maxTilt, maxTilt) / maxTilt;
            me.mouseTargetY = clamp(y, -maxTilt, maxTilt) / maxTilt;

            const log = document.getElementById("log")!
            log.innerHTML = `ɑ=${alpha.toFixed(1)} β=${beta.toFixed(1)} γ=${gamma.toFixed(1)} x=${me.mouseTargetX.toFixed(2)} y=${me.mouseTargetY.toFixed(2)}`;

            console.log(`ɑ=${alpha.toFixed(1)} β=${beta.toFixed(1)} γ=${gamma.toFixed(1)} x=${me.mouseTargetX.toFixed(2)} y=${me.mouseTargetY.toFixed(2)}`)
        }

        // Handle security on iOS 13+ devices
        const root = document.getElementById("root")!;
        root.addEventListener("click", () => {
            if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
                (DeviceMotionEvent as any).requestPermission()
                    .then((state: any) => {
                        if (state === 'granted')
                            window.addEventListener('devicemotion', handleOrientation);
                        else
                            console.error('Request to access the orientation was rejected');
                    })
                    .catch(console.error);
            }
            else {
                window.addEventListener('devicemotion', handleOrientation);
            }
        })
    }

    mouseMove() {
        let that = this;
        document.addEventListener('mousemove', function (e) {
            let halfX = that.windowWidth / 2;
            let halfY = that.windowHeight / 2;

            that.mouseTargetX = (halfX - e.clientX) / halfX;
            that.mouseTargetY = (halfY - e.clientY) / halfY;
        });
    }

    render() {
        let now = new Date().getTime();
        let currentTime = (now - this.startTime) / 1000;
        this.uTime.set(currentTime);

        // inertia
        this.mouseX += (this.mouseTargetX - this.mouseX) * 0.05;
        this.mouseY += (this.mouseTargetY - this.mouseY) * 0.05;

        this.uMouse.set(this.mouseX, this.mouseY);

        // render
        this.billboard.render(this.gl);
        requestAnimationFrame(this.render.bind(this));
    }
}

function loadImage(url: string, callback: any) {
    var image = new Image();
    image.src = url;
    image.onload = callback;
    return image;
}

function loadImages(urls: string[], callback: any) {
    var images: any[] = [];
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


class Uniform {
    name: any;
    suffix: any;
    gl: any;
    program: any;
    location: any;

    constructor(name: string, suffix: string, program: any, gl: any) {
        this.name = name;
        this.suffix = suffix;
        this.gl = gl;
        this.program = program;
        this.location = gl.getUniformLocation(program, name);
    }

    set(...values: any) {
        let method = 'uniform' + this.suffix;
        let args = [this.location].concat(values);
        this.gl[method].apply(this.gl, args);
    }
}


class Rect {
    constructor(gl: WebGLRenderingContext) {
        var buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, Rect.verts, gl.STATIC_DRAW);
    }

    render(gl: WebGLRenderingContext) {
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    static verts = new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        1, 1,
    ]);
}


function clamp(numba: number, lower: number, upper: number) {
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


new Fake3D();
