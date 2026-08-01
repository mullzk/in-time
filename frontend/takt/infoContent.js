// The Takt panel's info-modal content. Kept apart from the modal shell so
// the copy lives in one place and the conditional shortcut (station search is a
// panel capability) stays a pure, testable decision.

const link = (label, href) => ({ label, href });

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
    title: 'All in Time',
    intro: [
      [
        'All in Time macht den Schweizer Taktfahrplan sicht- und hörbar. ' +
          'Entstanden im Rahmen des stets inspirierenden ',
        link(
          'CAS Generative Data Design',
          'https://www.hkb.bfh.ch/de/weiterbildung/cas/generative-data-design/',
        ),
        ' der ',
        link('HKB', 'https://www.hkb.bfh.ch/de/'),
        ', wird der Fahrplan des heutigen Tages gemäss ',
        link('opentransportdata.swiss', 'https://opentransportdata.swiss'),
        ' angezeigt. Weitere Quellen: ',
        link('Bundesamt für Verkehr', 'https://www.bav.admin.ch/de/eisenbahn'),
        ' und ',
        link('swisstopo', 'https://www.swisstopo.admin.ch/de'),
        '. Quellcode: ',
        link(
          'github.com/mullzk/in-time/',
          'https://github.com/mullzk/in-time/',
        ),
        '.',
      ],
    ],
    controlHelp:
      'In der Seitenleiste (☰ oben links) lassen sich verschiedene ' +
      'Karten-Hintergründe wählen und einzelne Inhalts-Ebenen ein- oder ' +
      'ausblenden.',
    shortcuts,
  };
}
