from flask import Flask, request, jsonify
import json
import os

# Load the schema for validation (optional but good practice)
SCHEMA_FILE_PATH = os.path.join(os.path.dirname(__file__), '../../interface/message_schema.json')
MESSAGE_SCHEMA = None
try:
    with open(SCHEMA_FILE_PATH, 'r') as f:
        MESSAGE_SCHEMA = json.load(f)
    # Basic check if schema looks like what we expect
    if not (MESSAGE_SCHEMA and 'properties' in MESSAGE_SCHEMA and 'eventType' in MESSAGE_SCHEMA['properties']):
        print(f"Warning: Loaded schema from {SCHEMA_FILE_PATH} might not be the expected OrcaToTaskMessage schema.")
        MESSAGE_SCHEMA = None # Don't use if it looks wrong
except FileNotFoundError:
    print(f"Warning: Schema file not found at {SCHEMA_FILE_PATH}. Validation will be basic.")
except json.JSONDecodeError:
    print(f"Warning: Error decoding schema file at {SCHEMA_FILE_PATH}. Validation will be basic.")

# For more robust validation, jsonschema library would be used, 
# but for a simple mock, we'll do basic checks.
# from jsonschema import validate, ValidationError

app = Flask(__name__)

received_messages = [] # In-memory store for received messages during a test run

@app.route('/mock_orca_callback', methods=['POST'])
def mock_orca_callback():
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    print(f"MockListener: Received data: {json.dumps(data)}")
    received_messages.append(data)

    # Basic Validation (can be enhanced with jsonschema library)
    errors = []
    if MESSAGE_SCHEMA:
        # Simple check for required fields based on loaded schema
        for req_field in MESSAGE_SCHEMA.get('required', []):
            if req_field not in data:
                errors.append(f"Missing required field: {req_field}")
        if 'eventType' in data and data['eventType'] not in MESSAGE_SCHEMA['properties']['eventType'].get('enum', []):
            errors.append(f"Invalid eventType: {data['eventType']}")
    else: # Fallback basic validation if schema load failed
        if not all(k in data for k in ["taskId", "eventType", "timestamp", "payload"]):
            errors.append("Missing one or more basic required fields: taskId, eventType, timestamp, payload")

    if errors:
        print(f"MockListener: Validation errors: {errors}")
        return jsonify({"status": "error", "message": "Validation failed", "errors": errors}), 400
    
    # Example: Echoing back a success message or part of the data
    return jsonify({
        "status": "received_ok", 
        "message_type_received": data.get("eventType"),
        "taskId_received": data.get("taskId")
    }), 200

@app.route('/get_received_messages', methods=['GET'])
def get_received_messages_route():
    return jsonify(received_messages)

@app.route('/clear_received_messages', methods=['POST'])
def clear_received_messages_route():
    global received_messages
    received_messages = []
    return jsonify({"status": "cleared"}), 200

if __name__ == '__main__':
    # To run this mock server: python mock_listener.py
    # It will typically run on http://127.0.0.1:3000
    # The OrcaTaskClient uses this URL as a fallback if PARENT_NODE_CALLBACK_URL is not set.
    port = int(os.environ.get("FLASK_RUN_PORT", 3000))
    print(f"Starting mock listener on port {port}...")
    app.run(debug=False, port=port, host='0.0.0.0') 