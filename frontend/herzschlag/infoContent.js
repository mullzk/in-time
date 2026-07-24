// The Herzschlag panel's info-modal content. Kept apart from the modal shell so
// the copy lives in one place and the conditional shortcut (station search is a
// panel capability) stays a pure, testable decision.
export function buildInfoContent({ stationSearch }) {
  const shortcuts = [
    { keys: 'Leertaste', description: 'Wiedergabe starten und pausieren' },
    { keys: '+', description: 'Hineinzoomen' },
    { keys: '−', description: 'Herauszoomen' },
    { keys: 'F', description: 'Ganze Schweiz einpassen' },
    { keys: 'H', description: 'Haltestellen ein- und ausblenden' },
    { keys: 'S', description: 'Seitenleiste öffnen und schließen' },
  ];
  if (stationSearch) {
    shortcuts.push({ keys: 'G', description: 'Stationssuche öffnen' });
  }
  shortcuts.push({
    keys: 'I',
    description: 'Diese Information öffnen und schließen',
  });

  return {
    title: 'In Time',
    intro: [
      'In Time macht den Rhythmus des Schweizer Taktfahrplans sicht- und ' +
        'hörbar. Dieser Text ist vorläufig und wird später durch die ' +
        'endgültige Projektbeschreibung ersetzt. Er umfasst rund vier Zeilen ' +
        'und dient vorerst nur der Vorschau des Layouts.',
    ],
    controlHelp:
      'In der Seitenleiste (☰ oben links) lassen sich verschiedene ' +
      'Karten-Hintergründe wählen und einzelne Inhalts-Ebenen ein- oder ' +
      'ausblenden.',
    shortcuts,
  };
}
