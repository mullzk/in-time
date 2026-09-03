// What the welcome shows a first-time visitor: the four tiles worth finding,
// each named by the tile it opens.

export function buildWelcomeContent() {
  return {
    title: 'All in Time',
    lead: 'Der Fahrplan von heute, in Bewegung. Vier Dinge, bevor es losgeht:',
    place: {
      wide: 'Alles liegt in der Leiste am linken Rand.',
      narrow: 'Alles liegt in der Leiste am unteren Rand.',
    },
    hints: [
      {
        tile: 'sound',
        title: 'Vertonung',
        text: 'Der Rhythmus des Taktfahrplans: Wähle eine Vertonung, und jede Ankunft und jede Abfahrt an deiner Haltestelle wird zu einem Ton.',
      },
      {
        tile: 'views',
        title: 'Ansichten',
        text: 'Der Fahrplan dreimal anders dargestellt: Der Takt, die Kaskade aller Anschlussverbindungen, und eine Kartographie der Reisezeit.',
      },
      {
        tile: 'map',
        title: 'Hintergrund',
        text: 'Verschiedene swisstopo-Karten helfen beim Verorten der Züge.',
      },
      {
        tile: 'elements',
        title: 'Kategorien',
        text: 'Fernverkehr, Regionalverkehr, Tram und Bus lassen sich einzeln ein- und ausblenden, ebenso das Streckennetz und die Haltestellen.',
      },
    ],
    dismissLabel: 'Los geht’s',
    replayLabel: 'Einführung nochmals zeigen',
  };
}
