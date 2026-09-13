export function buildInfoContent() {
  return {
    title: 'Puls',
    intro: [
      [
        'Das Streckennetz mit Fernverkehr (schwarz) und InterRegio, Regio und ' +
          'S-Bahn (grau). Basel, Olten, Zürich, Bern, Luzern, St. Gallen und Chur ' +
          'pulsieren: der innere Kreis wächst mit jedem IC/EC, der im ' +
          'Bahnhof steht, der mittlere Ring mit jedem IR, der ' +
          'äussere Ring mit allen übrigen Zügen.',
      ],
    ],
    shortcuts: [
      { keys: 'Leertaste', description: 'Wiedergabe pause/weiter' },
      { keys: 'F', description: 'Ganze Schweiz einpassen' },
      { keys: 'I', description: 'Diese Information öffnen' },
    ],
  };
}
