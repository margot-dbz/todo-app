import json
import uuid
from datetime import datetime
from pathlib import Path
from flask import Flask, jsonify, request, render_template

app = Flask(__name__)
TASKS_FILE = Path(__file__).parent / "tasks.json"


def load_tasks():
    if not TASKS_FILE.exists():
        return []
    return json.loads(TASKS_FILE.read_text())


def save_tasks(tasks):
    TASKS_FILE.write_text(json.dumps(tasks, indent=2))


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    return jsonify(load_tasks())


@app.route("/api/tasks", methods=["POST"])
def add_task():
    text = request.json.get("text", "").strip()
    if not text:
        return jsonify({"error": "Task text is required"}), 400
    tasks = load_tasks()
    task = {"id": str(uuid.uuid4()), "text": text, "done": False, "created_at": datetime.utcnow().isoformat()}
    tasks.append(task)
    save_tasks(tasks)
    return jsonify(task), 201


@app.route("/api/tasks/<task_id>", methods=["PATCH"])
def complete_task(task_id):
    tasks = load_tasks()
    for task in tasks:
        if task["id"] == task_id:
            task["done"] = True
            save_tasks(tasks)
            return jsonify(task)
    return jsonify({"error": "Task not found"}), 404


@app.route("/api/tasks/<task_id>", methods=["DELETE"])
def delete_task(task_id):
    tasks = load_tasks()
    tasks = [t for t in tasks if t["id"] != task_id]
    save_tasks(tasks)
    return "", 204


@app.route("/api/tasks/reorder", methods=["POST"])
def reorder_tasks():
    ids = request.json.get("ids", [])
    tasks = load_tasks()
    id_to_task = {t["id"]: t for t in tasks}
    pending = [id_to_task[i] for i in ids if i in id_to_task]
    done = [t for t in tasks if t["done"]]
    save_tasks(pending + done)
    return jsonify(pending + done)


if __name__ == "__main__":
    app.run(debug=True)
