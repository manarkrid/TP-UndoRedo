import Stack from './stack.js'; // Stack utilisée pour Undo/Redo
import Konva from "konva";
import { createMachine, interpret } from "xstate";

// ---------- Stage et layers ----------
const stage = new Konva.Stage({
    container: "container",
    width: 400,
    height: 400,
});

const dessin = new Konva.Layer();      // Couche principale pour les polylines sauvegardées
const temporaire = new Konva.Layer();  // Couche temporaire pour la polyline en cours de création
stage.add(dessin);
stage.add(temporaire);

const MAX_POINTS = 10;
let polyline; // La polyline en cours de création

// ---------- Étape 1 : Pattern Command ----------
class Command {
    execute() {}
    undo() {}
}

// Commande pour ajouter une polyline
class AddPolylineCommand extends Command {
    constructor(line, layer) {
        super();
        this.line = line;
        this.layer = layer;
    }
    execute() {
        this.layer.add(this.line);  // Ajout effectif de la polyline
        this.layer.draw();
    }
    undo() {
        this.line.remove();         // Annule l'ajout
        this.layer.draw();
    }
}

// Commande supplémentaire pour changer la couleur
class ChangeColorCommand extends Command {
    constructor(line, newColor) {
        super();
        this.line = line;
        this.newColor = newColor;
        this.oldColor = line.stroke();
    }
    execute() {
        this.line.stroke(this.newColor); // Appliquer nouvelle couleur
        dessin.draw();
    }
    undo() {
        this.line.stroke(this.oldColor); // Restaurer couleur précédente
        dessin.draw();
    }
}

// ---------- Étape 2 : UndoManager ----------
class UndoManager {
    constructor() {
        this.undoStack = new Stack(); // Stack pour stocker les commandes à undo
        this.redoStack = new Stack(); // Stack pour stocker les commandes à redo
    }

    executeCommand(cmd) {
        cmd.execute();
        this.undoStack.push(cmd); // Ajouter à undo
        this.redoStack.clear();   // Vider redo à chaque nouvelle commande
    }

    undo() {
        if (!this.canUndo()) return;
        const cmd = this.undoStack.pop();
        cmd.undo();
        this.redoStack.push(cmd); // Déplacer dans redo
    }

    redo() {
        if (!this.canRedo()) return;
        const cmd = this.redoStack.pop();
        cmd.execute();
        this.undoStack.push(cmd); // Déplacer dans undo
    }

    canUndo() { return !this.undoStack.isEmpty(); } // Étape 3 : canUndo
    canRedo() { return !this.redoStack.isEmpty(); } // Étape 3 : canRedo
}

const undoManager = new UndoManager();

// ---------- Étape 1/2 : Machine XState pour créer la polyline ----------
const polylineMachine = createMachine({
    id: "polyLine",
    initial: "idle",
    states: {
        idle: { on: { MOUSECLICK: { target: "onePoint", actions: "createLine" } } },
        onePoint: {
            on: {
                MOUSECLICK: { target: "manyPoints", actions: "addPoint" },
                MOUSEMOVE: { actions: "setLastPoint" },
                Escape: { target: "idle", actions: "abandon" }
            }
        },
        manyPoints: {
            on: {
                MOUSECLICK: [
                    { actions: "addPoint", cond: "pasPlein" },
                    { target: "idle", actions: ["addPoint", "saveLine"] }
                ],
                MOUSEMOVE: { actions: "setLastPoint" },
                Escape: { target: "idle", actions: "abandon" },
                Enter: { target: "idle", actions: "saveLine" },
                Backspace: [
                    { target: "manyPoints", actions: "removeLastPoint", cond: "plusDeDeuxPoints", internal: true },
                    { target: "onePoint", actions: "removeLastPoint" }
                ]
            }
        }
    }
}, {
    actions: {
        // Création d'une nouvelle polyline (temporaire)
        createLine: () => {
            const pos = stage.getPointerPosition();
            polyline = new Konva.Line({
                points: [pos.x, pos.y, pos.x, pos.y],
                stroke: "red",
                strokeWidth: 2,
            });
            temporaire.add(polyline);
        },

        setLastPoint: () => { // Mise à jour du dernier point de la polyline
            const pos = stage.getPointerPosition();
            const pts = polyline.points();
            polyline.points(pts.slice(0, pts.length - 2).concat([pos.x, pos.y]));
            temporaire.batchDraw();
        },

        addPoint: () => { // Ajouter un point à la polyline
            const pos = stage.getPointerPosition();
            polyline.points([...polyline.points(), pos.x, pos.y]);
            temporaire.batchDraw();
        },

        removeLastPoint: () => { // Supprimer le dernier point
            const pts = polyline.points();
            const provisoire = pts.slice(pts.length - 2);
            const oldPts = pts.slice(0, pts.length - 4);
            polyline.points(oldPts.concat(provisoire));
            temporaire.batchDraw();
        },

        abandon: () => { polyline.remove(); }, // Abandonner la polyline en cours

        saveLine: () => { 
            // Sauvegarder la polyline : Étape 1, création de la commande
            polyline.remove();
            const pts = polyline.points();
            polyline.points(pts.slice(0, pts.length - 2));
            polyline.stroke("black");

            // Étape 2 : exécuter via UndoManager
            const cmd = new AddPolylineCommand(polyline, dessin);
            undoManager.executeCommand(cmd);

            // Étape 3 : Mettre à jour les boutons Undo/Redo
            updateButtons();
        }
    },
    guards: {
        pasPlein: () => polyline.points().length < MAX_POINTS * 2,
        plusDeDeuxPoints: () => polyline.points().length > 6
    }
});

const polylineService = interpret(polylineMachine).start();

stage.on("click", () => polylineService.send("MOUSECLICK"));
stage.on("mousemove", () => polylineService.send("MOUSEMOVE"));
window.addEventListener("keydown", (e) => polylineService.send(e.key));

// ---------- Étape 2/3 : Boutons Undo/Redo/Change Color ----------
const undoButton = document.getElementById("undo");
const redoButton = document.getElementById("redo");
const changeColorButton = document.getElementById("changeColor");

undoButton.addEventListener("click", () => { undoManager.undo(); updateButtons(); });
redoButton.addEventListener("click", () => { undoManager.redo(); updateButtons(); });
changeColorButton.addEventListener("click", () => {
    if (!polyline) return;
    const cmd = new ChangeColorCommand(polyline, "blue"); // Étape 3 : commande supplémentaire
    undoManager.executeCommand(cmd);
    updateButtons();
});

// Étape 3 : activer/désactiver boutons
function updateButtons() {
    undoButton.disabled = !undoManager.canUndo();
    redoButton.disabled = !undoManager.canRedo();
}

// Initialisation
updateButtons();
