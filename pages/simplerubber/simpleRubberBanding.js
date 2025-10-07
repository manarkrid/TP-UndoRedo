import Konva from 'konva';

// L'endroit où on dessine
const stage = new Konva.Stage({
  container: 'container',
  width: 400,
  height: 400
});
// Une couche pour le dessin
const dessin = new Konva.Layer();
// Une couche pour la polyline en cours de construction
const temporaire = new Konva.Layer();
stage.add(dessin);
stage.add(temporaire);

let rubber; // La ligne provisoire

// On énumère les états possibles
// Pas d'énumération en JavaScript, on utilise un objet
const States = {
  IDLE: 0,
  DRAWING: 1,
};
let currentState = States.IDLE; // variable d'état

// Les "event handlers" sont déduits de la matrice d'états
stage.on("click", 
    (e) => {
        if (currentState == States.IDLE) {
            createLine(e);
            currentState = States.DRAWING;
        } else {
            saveLine();
            currentState = States.IDLE;
        }
    }
);

stage.on("mousemove", (e) => {
    if (currentState == States.DRAWING) {
      setLastPoint(e);
    }
  });


// == Les actions en réponse aux événements ==
/**
* Crée une lignne.
* @param {Event} event - The mouse event.
*/
function createLine(event) {
  const pos = stage.getPointerPosition();
  rubber = new Konva.Line({
      points: [pos.x, pos.y, pos.x, pos.y],
      stroke: 'red',
      strokeWidth: 2
  });
  temporaire.add(rubber);
}
/**
* Modifie le second point de la ligne.
* @param {Event} event - The mouse event.
*/
function setLastPoint(event) {
  const pos = stage.getPointerPosition();
  rubber.points([rubber.points()[0], rubber.points()[1], pos.x, pos.y]);
  temporaire.batchDraw();
}

function saveLine() {
  rubber.remove(); // On l'enlève de la couche temporaire
  rubber.stroke("black"); // On change la couleur
  dessin.add(rubber); // On l'ajoute à la ouche dessin
}