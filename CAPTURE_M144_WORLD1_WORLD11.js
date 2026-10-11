/* MAPS_ENGINE M144: read-only extension to M130 physical capture.
 * Paste CAPTURE_M130_WORLD1_WORLD11.js first, then paste this file.
 * No scene, assets, scheduler, renderer or GPU flags are modified.
 * Download combined physical M69/M74/M75/M127/M144 + frames/draw calls:
 * __MUWEB_MAPS_CAPTURE_M144__.download()
 */
(() => {
  const base = globalThis.__MUWEB_MAPS_CAPTURE_M130__;
  if (!base || typeof base.data !== 'function') {
    console.warn('[MAPS M144 CAPTURE] Paste CAPTURE_M130_WORLD1_WORLD11.js first.');
    return;
  }
  globalThis.__MUWEB_MAPS_CAPTURE_M144__?.stop?.(false);
  const releases=[];
  let last=null,active=true;
  const sample=()=>{
    const p=globalThis.__MUWEB_MAP_RELEASE_PROFILE__;
    if (!p || p===last) return;
    last=p;
    if (p.version !== 'M144' || (p.world!==1&&p.world!==11)) return;
    if (releases.length>=256) return;
    releases.push({capturedAtMs:performance.now(),profile:JSON.parse(JSON.stringify(p))});
  };
  const timer=setInterval(sample,250);
  const recorder={
    data(){sample();return {...base.data(),format:'MUWEB_MAPS_ENGINE_M144_PHYSICAL_V1',
      m144ReleaseCaptures:releases.slice(),
      noteM144:'M144 teardown failure counters are read-only, polled every 250ms. Rapid multiple transitions within one interval can overwrite a release event; require both worlds and verify counts against the console. M75 phases are wall times, not GPU timers.'};},
    stop(stopBase=true){if(active){sample();active=false;clearInterval(timer);}if(stopBase)base.stop?.();},
    download(){const blob=new Blob([JSON.stringify(this.data(),null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='MUWEB_M144_World1_World11_physical_capture.json';
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);},
  };
  globalThis.__MUWEB_MAPS_CAPTURE_M144__=recorder;
  console.info('[MAPS M144 CAPTURE] Read-only World1/World11 teardown + M130 stages/frames recorder active.');
})();
