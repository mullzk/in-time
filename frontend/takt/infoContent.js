// The Takt panel's info-modal content.

const link = (label, href) => ({ label, href });

export function buildInfoContent() {
  // The card sets the list in two columns, filled row by row, so every second
  // entry lands in the second column.
  const shortcuts = [
    { keys: 'Leertaste', description: 'Wiedergabe starten und pausieren' },
    { keys: 'H', description: 'Haltestellen ein- und ausblenden' },
    { keys: '+', description: 'Hineinzoomen' },
    { keys: 'N', description: 'Streckennetz ein- und ausblenden' },
    { keys: '−', description: 'Herauszoomen' },
    { keys: 'G', description: 'Stationssuche öffnen' },
    { keys: 'F', description: 'Ganze Schweiz einpassen' },
    { keys: 'I', description: 'Diese Information öffnen und schließen' },
  ];

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
      [
        'Wenn eine Vertonung ausgewählt ist, wird jedes Ereignis an der',
        ' Haltestelle durch einen Ton repräsentiert - abgestuft nach',
        ' Verkehrsträger, Ankunft, Abfahrt und Aufenthalt. So lässt sich der',
        ' Takt des Taktfahrplans auch als Rhythmus erfahren.',
      ],
    ],
    shortcuts,
  };
}
