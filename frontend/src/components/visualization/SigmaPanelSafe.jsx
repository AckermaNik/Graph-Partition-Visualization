import React, { useRef, useEffect, useMemo } from 'react';
import Graph from 'graphology';
import { SigmaContainer, useSigma } from '@react-sigma/core';

//It keeps Sigma’s WebGL canvas perfectly sized to its parent container.
function ResizeToHost({ hostRef }) {
  const sigma = useSigma();

  useEffect(() => {
    const el = hostRef.current; //the outer div wrapping SigmaContainer.
    if (!el) return;

    let raf = 0; //raf is the ID that represents the scheduled execution of that specific callback

    const onResize = () => {
      cancelAnimationFrame(raf); //(deletes) the scheduled execution associated with that raf ID if it has not run yet.

      raf = requestAnimationFrame(() => {
        //Run this function before the next repaint
        sigma.resize(); //updates WebGL viewport & internal buffers
        sigma.refresh(); //redraws the graph
      });
    };

    const ro = new ResizeObserver(onResize); //creates the observer registered onResize as the callback
    ro.observe(el);

    onResize(); // Forces a first resize immediately

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect(); //Stops observing when component unmounts (no leaks)
    };
  }, [sigma, hostRef]); //Creating a new panel/ refresh page creates a new Sigma instance → sigma changes → effect reruns

  return null;
}

export default function SigmaPanelSafe({ settings, children }) {
  const hostRef = useRef(null);

  // This is the internal graph SIGMA imports INTO (must be multi to allow parallel edges)
  const sigmaGraph = useMemo(() => new Graph({ type: 'directed', multi: true }), []);

  // memoize the settings passed to SigmaContainer
  const sigmaSettings = useMemo(() => ({ ...(settings ?? {}), allowInvalidContainer: true }), [settings]);

  return (
    <div
      ref={hostRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex'
      }}
    >
      <SigmaContainer graph={sigmaGraph} settings={sigmaSettings} style={{ width: '100%', height: '100%' }}>
        <ResizeToHost hostRef={hostRef} />
        {children}
      </SigmaContainer>
    </div>
  );
}
