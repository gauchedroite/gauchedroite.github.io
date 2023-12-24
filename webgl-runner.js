class WebglRunner {
    constructor() {
        this._pause = false;
        this._paused = 0;
        this._startPause = 0;
        this.pause = () => {
            if (!this._pause) {
                this._pause = true;
                this._startPause = performance.now();
            }
        };
        this.resume = () => {
            if (this._pause) {
                this._pause = false;
                this._paused += performance.now() - this._startPause;
            }
        };
        this.run = (canvas, fstext, vstext) => {
            // Get context
            var gl = canvas.getContext("experimental-webgl", { preserveDrawingBuffer: true });
            if (!gl)
                return alert("Your web browser does not support WebGL");
            // Create the program
            var prog = gl.createProgram();
            // Attach the vertex shader
            var vs = gl.createShader(gl.VERTEX_SHADER);
            gl.shaderSource(vs, vstext);
            gl.compileShader(vs);
            if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS))
                return console.log("Could not compile vertex shader: " + gl.getShaderInfoLog(vs));
            gl.attachShader(prog, vs);
            // Attach the fragment shader
            var fs = gl.createShader(gl.FRAGMENT_SHADER);
            gl.shaderSource(fs, fstext);
            gl.compileShader(fs);
            if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS))
                return console.log("Could not compile fragment shader: " + gl.getShaderInfoLog(fs));
            gl.attachShader(prog, fs);
            // Link and then use the program
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
                return console.log("Could not link the shader program");
            gl.useProgram(prog);
            // Lookup uniforms
            var u_resolution = gl.getUniformLocation(prog, "resolution");
            var u_time = gl.getUniformLocation(prog, "time");
            var u_mouse = gl.getUniformLocation(prog, "mouse");
            // Populate the geometry in the buffer
            var arr = [
                -1, 1, 0,
                1, 1, 0,
                -1, -1, 0,
                1, -1, 0
            ];
            gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
            // Map the "a_square" attribute to the buffer
            var a_square = gl.getAttribLocation(prog, "a_square");
            gl.enableVertexAttribArray(a_square);
            gl.vertexAttribPointer(a_square, 3, gl.FLOAT, false, 0, 0);
            // Start the draw loop
            var me = this;
            requestAnimationFrame(drawScene);
            // Draw scene
            function drawScene(now) {
                if (me._pause) {
                    requestAnimationFrame(drawScene);
                    return;
                }
                // Resize canvas
                var canvas = gl.canvas;
                var displayWidth = canvas.clientWidth;
                var displayHeight = canvas.clientHeight;
                // Make canvas the same size and set the viewport to match
                if (canvas.width != displayWidth || canvas.height != displayHeight) {
                    canvas.width = displayWidth;
                    canvas.height = displayHeight;
                    gl.viewport(0, 0, canvas.width, canvas.height);
                }
                // Clear canvas
                gl.clearColor(0, 0, 0, 0.2);
                gl.clear(gl.COLOR_BUFFER_BIT);
                // Set the resolution, time, and mouse uniforms
                gl.uniform2f(u_resolution, gl.canvas.width, gl.canvas.height);
                gl.uniform1f(u_time, (now - me._paused) * 0.001);
                gl.uniform2f(u_mouse, 0, 0.95);
                // Draw the geometry
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                requestAnimationFrame(drawScene);
            }
            ;
        };
    }
}
