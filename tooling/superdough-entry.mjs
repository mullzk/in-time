// The single entry esbuild bundles into frontend/vendor/superdough.mjs. All five
// surfaces must come from one shared module graph: @strudel/soundfonts registers
// its instruments through @strudel/webaudio, which re-exports superdough's sound
// registry, so registerSoundfonts and the superdough player only meet when a
// single superdough instance backs both. Bundling one entry guarantees that.

export { mini } from '@strudel/mini';
export { registerSoundfonts } from '@strudel/soundfonts';
export {
  getAudioContext,
  initAudio,
  registerSynthSounds,
  samples,
  superdough,
} from 'superdough';
