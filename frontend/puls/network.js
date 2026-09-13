import { trainClassOf } from './trainClasses.js';

export function edgesTravelledBy(trips, edges) {
  const edgeIndices = new Set(
    trips
      .filter(({ category }) => trainClassOf(category) !== null)
      .flatMap(({ events }) =>
        events.flatMap(({ legEdges }) =>
          legEdges.map((signedEdge) => Math.abs(signedEdge) - 1),
        ),
      ),
  );
  return [...edgeIndices].map((edgeIndex) => edges[edgeIndex]);
}
