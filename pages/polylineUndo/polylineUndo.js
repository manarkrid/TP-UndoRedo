import Stack from './stack.js';
import Konva from "konva";
import { createMachine, interpret } from "xstate";

// ---------- Stage et layers ----------
const stage = new Konva.Stage({
    container: "container",
    width: 400,
    height: 400,
});

const dessin = new Konva.Layer();
const temporaire = new Konva.Layer();
stage.add(dessin);
stage.add(temporaire);

const MAX_POINTS = 10;
let polyline;

// ---------- Pattern Command ----------
class Command {
    execute() {}
    undo() {}
}

class AddPolylineCommand extends Command {
    constructor(line, layer) {
        super();
        this.line = line;
        this.layer = layer;
    }
    execute() {
        this.layer.add(this.line);
        this.layer.draw();
    }
    undo() {
        this.line.remove();
        this.layer.draw();
    }
}

class ChangeColorCommand extends Command {
    constructor(line, newColor) {
        super();
        this.line = line;
        this.newColor = newColor;
        this.oldColor = line.stroke();
    }
    execute() {
        this.line.stroke(this.newColor);
        dessin.draw();
    }
    undo() {
        this.line.stroke(this.oldColor);
        dessin.draw();
    }
}

// ---------- UndoManager ----------
class UndoManager {
    constructor() {
        this.undoStack = new Stack();
        this.redoStack = new Stack();
    }
    executeCommand(cmd) {
        cmd.execute();
        this.undoStack.push(cmd);
        this.redoStack.clear();
    }
    undo() {
        if (!this.canUndo()) return;
        const cmd = this.undoStack.pop();
        cmd.undo();
        this.redoStack.push(cmd);
    }
    redo() {
        if (!this.canRedo()) return;
        const cmd = this.redoStack.pop();
        cmd.execute();
        this.undoStack.push(cmd);
    }
    canUndo() { return !this.undoStack.isEmpty(); }
    canRedo() { return !this.redoStack.isEmpty(); }
}

const undoManager = new UndoManager();

// ---------- XState Polyline Machine ----------
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
        createLine: () => {
            const pos = stage.getPointerPosition();
            polyline = new Konva.Line({
                points: [pos.x, pos.y, pos.x, pos.y],
                stroke: "red",
                strokeWidth: 2,
            });
            temporaire.add(polyline);
        },
        setLastPoint: () => {
            const pos = stage.getPointerPosition();
            const pts = polyline.points();
            polyline.points(pts.slice(0, pts.length - 2).concat([pos.x, pos.y]));
            temporaire.batchDraw();
        },
        addPoint: () => {
            const pos = stage.getPointerPosition();
            polyline.points([...polyline.points(), pos.x, pos.y]);
            temporaire.batchDraw();
        },
        removeLastPoint: () => {
            const pts = polyline.points();
            const provisoire = pts.slice(pts.length - 2);
            const oldPts = pts.slice(0, pts.length - 4);
            polyline.points(oldPts.concat(provisoire));
            temporaire.batchDraw();
        },
        abandon: () => { polyline.remove(); },
        saveLine: () => {
            polyline.remove();
            const pts = polyline.points();
            polyline.points(pts.slice(0, pts.length - 2));
            polyline.stroke("black");
            // Ajouter au UndoManager
            const cmd = new AddPolylineCommand(polyline, dessin);
            undoManager.executeCommand(cmd);
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

// ---------- Boutons ----------
const undoButton = document.getElementById("undo");
const redoButton = document.getElementById("redo");
const changeColorButton = document.getElementById("changeColor");

undoButton.addEventListener("click", () => { undoManager.undo(); updateButtons(); });
redoButton.addEventListener("click", () => { undoManager.redo(); updateButtons(); });
changeColorButton.addEventListener("click", () => {
    if (!polyline) return;
    const cmd = new ChangeColorCommand(polyline, "blue");
    undoManager.executeCommand(cmd);
    updateButtons();
});

function updateButtons() {
    undoButton.disabled = !undoManager.canUndo();
    redoButton.disabled = !undoManager.canRedo();
}

// Initial state
updateButtons();
