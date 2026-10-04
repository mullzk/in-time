// The Puls panel's info-modal content.

const link = (label, href) => ({ label, href });

export function buildInfoContent() {
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
        'Der Puls zeigt, wie die Haupt-Knoten Zürich, Basel, Bern sowie ' +
          'Olten, Luzern, St. Gallen und Chur im Halbstunden-Takt pulsieren. ' +
          'Kurz vor jeder vollen und halben Stunde treffen die Züge ein, ' +
          'kurz danach fahren sie wieder ab.',
      ],
    ],
    shortcuts: [
      { keys: 'Leertaste', description: 'Wiedergabe pause/weiter' },
      { keys: 'F', description: 'Ganze Schweiz einpassen' },
      { keys: 'C', description: 'Ankunfts- und Abfahrtsphase einfärben' },
      { keys: 'I', description: 'Diese Information öffnen' },
    ],
  };
}
