import { describe, it, assert, assertThrows } from './testRunner.js';
import { initWebGL, destroyWebGL } from '../modules/webglRenderer.js';

describe('WebGL Renderer', () => {
  it('initWebGL returns renderer with expected properties', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 240;
    let renderer;
    try {
      renderer = initWebGL(canvas);
      assert(renderer.gl instanceof WebGL2RenderingContext, 'should have WebGL2 context');
      assert(renderer.maskProgram != null, 'should have maskProgram');
      assert(renderer.partProgram != null, 'should have partProgram');
      assert(renderer.videoTex != null, 'should have videoTex');
      assert(renderer.quadVAO != null, 'should have quadVAO');
      assert(renderer.partVAO != null, 'should have partVAO');
    } finally {
      if (renderer) destroyWebGL(renderer);
    }
  });

  it('destroyWebGL does not throw on null', () => {
    destroyWebGL(null);
    assert(true);
  });

  it('destroyWebGL cleans up without error', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    let renderer;
    try {
      renderer = initWebGL(canvas);
    } catch (e) {
      // WebGL2 may not be available in some test environments
      console.warn('Skipping WebGL cleanup test:', e.message);
      return;
    }
    destroyWebGL(renderer);
    assert(true, 'cleanup should not throw');
  });

  it('initWebGL throws when WebGL2 not available', () => {
    const canvas = document.createElement('canvas');
    const origGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = (type) => {
      if (type === 'webgl2') return null;
      return origGetContext(type);
    };
    assertThrows(() => initWebGL(canvas), 'should throw when WebGL2 unavailable');
  });
});

