// Ami utazás közben is változhat, az ide kerül. Mentés után push, és pár perc múlva él az oldal.
window.TRIP_CONFIG = {
  repo: 'tottiandor/brazil-2026', // innen jön a frissen szinkronizált Maps-lista (raw.githubusercontent.com)

  // Élő kamerák. Ha egy adás leáll, a YouTube-on kikeresett új videó azonosítóját írd a videoId-be.
  // Ellenőrzés: a videó oldalán legyen piros LIVE jelzés, és engedje a beágyazást.
  webcams: {
    // Homes in Rio panorámakamerája a Copacabana déli végén (Posto 6), a Forte de Copacabana mellett.
    // Ez van a legközelebb az ipanemai szálláshoz. (A régi EarthCam-adás megszűnt.)
    rio: {
      videoId: 'wyEi0OPai5g',
      title: 'Copacabana · Posto 6',
      // Ugyanattól a csatornától, a Copacabana Palace előtti kamera.
      fallback: 'https://www.youtube.com/watch?v=WEl_I5vmuSs',
    },
    // Salvadorhoz nincs önálló, folyamatosan élő Farol da Barra-adás: amit a YouTube kidob, az mind
    // régi felvétel. Helyette az Earth Now körbejáró brazil kameraadása megy, ebben Salvador is szerepel.
    // Ha egyszer lesz stabil Farol da Barra stream, annak az ID-ja jöhet ide.
    salvador: {
      videoId: '-Xtz0Jo5Ln8',
      title: 'Brazil Now · élő kamerák',
      fallback: 'https://www.youtube.com/results?search_query=farol+da+barra+ao+vivo&sp=EgJAAQ%253D%253D',
    },
  },
};
