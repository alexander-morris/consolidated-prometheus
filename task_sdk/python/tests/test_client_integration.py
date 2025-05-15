import unittest
import requests
import threading
import time
import subprocess # To run mock_listener.py
import os
import sys

from orca_task_sdk.client import OrcaTaskClient

# Ensure the mock_listener can be found if it's in the same directory
# For running with `python -m unittest discover tests` from task_sdk/python/
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class TestOrcaTaskClientIntegration(unittest.TestCase):
    mock_server_process = None
    mock_server_url = "http://127.0.0.1:3001" # Use a different port for this test
    callback_endpoint = f"{mock_server_url}/mock_orca_callback"
    messages_endpoint = f"{mock_server_url}/get_received_messages"
    clear_endpoint = f"{mock_server_url}/clear_received_messages"

    @classmethod
    def setUpClass(cls):
        mock_listener_script = os.path.join(BASE_DIR, 'mock_listener.py')
        python_executable = sys.executable
        
        env = os.environ.copy()
        env["FLASK_RUN_PORT"] = "3001"
        # Remove PYTHONUNBUFFERED or set to 0 if it causes issues with subprocess output reading
        # env["PYTHONUNBUFFERED"] = "0" 
        
        print(f"\n[IntegrationTest] Starting mock server: {python_executable} {mock_listener_script} on port 3001")
        cls.mock_server_process = subprocess.Popen(
            [python_executable, mock_listener_script],
            env=env,
            stdout=subprocess.PIPE, # Keep PIPE to potentially read output
            stderr=subprocess.PIPE  # Keep PIPE
        )
        print("[IntegrationTest] Waiting for mock server to start...")
        time.sleep(5) # Increased sleep duration

        # Check if the server is up by trying to connect to a known endpoint (e.g., clear_messages)
        # This is a more robust way to wait than a fixed sleep.
        retries = 5
        server_ready = False
        for i in range(retries):
            try:
                # Try a lightweight request to see if server is responding
                ping_url = f"{cls.mock_server_url}/get_received_messages" # any GET endpoint
                response = requests.get(ping_url, timeout=1)
                if response.status_code == 200:
                    server_ready = True
                    print("[IntegrationTest] Mock server responded to ping.")
                    break
            except requests.exceptions.ConnectionError:
                print(f"[IntegrationTest] Mock server not ready yet (attempt {i+1}/{retries}). Retrying in 1 sec...")
                time.sleep(1)
            except Exception as e:
                print(f"[IntegrationTest] Error pinging mock server: {e}")
                break # Don't retry on other errors
        
        if not server_ready:
            print("[IntegrationTest] Mock server did not become ready. Terminating process.")
            cls.mock_server_process.terminate()
            stdout, stderr = cls.mock_server_process.communicate(timeout=5) # Read output
            print("[IntegrationTest] Mock server STDOUT:")
            print(stdout.decode() if stdout else "(no stdout)")
            print("[IntegrationTest] Mock server STDERR:")
            print(stderr.decode() if stderr else "(no stderr)")
            cls.mock_server_process.wait()
            raise Exception("Mock server failed to start properly for integration tests.")
        
        print("[IntegrationTest] Mock server started successfully.")

    @classmethod
    def tearDownClass(cls):
        if cls.mock_server_process:
            print("\n[IntegrationTest] Terminating mock server...")
            cls.mock_server_process.terminate()
            try:
                stdout, stderr = cls.mock_server_process.communicate(timeout=5) # Ensure it finishes and get output
                # print("[IntegrationTest] Mock server STDOUT on teardown:")
                # print(stdout.decode() if stdout else "(no stdout)")
                # print("[IntegrationTest] Mock server STDERR on teardown:")
                # print(stderr.decode() if stderr else "(no stderr)")
            except subprocess.TimeoutExpired:
                print("[IntegrationTest] Mock server did not terminate gracefully, killing.")
                cls.mock_server_process.kill()
            cls.mock_server_process.wait()
            print("[IntegrationTest] Mock server stopped.")

    def setUp(self):
        try:
            response = requests.post(self.clear_endpoint, timeout=2)
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            self.fail(f"Mock server is not running or accessible for setUp clear. Error: {e}")
        self.client = OrcaTaskClient(callback_url=self.callback_endpoint, task_id="integration-test-001")

    def _get_received_messages(self):
        response = requests.get(self.messages_endpoint, timeout=1)
        response.raise_for_status()
        return response.json()

    def test_send_single_status_update(self):
        message_text = "Integration test status"
        progress_val = 75
        self.client.send_status_update(message_text, progress=progress_val)
        
        time.sleep(0.2) # Give a moment for the message to be processed
        received = self._get_received_messages()
        self.assertEqual(len(received), 1)
        msg = received[0]
        self.assertEqual(msg['taskId'], "integration-test-001")
        self.assertEqual(msg['eventType'], "status_update")
        self.assertEqual(msg['payload']['message'], message_text)
        self.assertEqual(msg['payload']['progress'], progress_val)

    def test_send_multiple_message_types(self):
        self.client.send_log_entry("info", "Integration log test")
        self.client.send_task_result("completed", result_data={"data": "all_good"})
        self.client.send_task_error("An integration error occurred", error_details={"code": 500})
        
        time.sleep(0.3) # Allow for multiple messages
        received = self._get_received_messages()
        self.assertEqual(len(received), 3)

        event_types_received = [msg['eventType'] for msg in received]
        self.assertIn("log_entry", event_types_received)
        self.assertIn("task_result", event_types_received)
        self.assertIn("task_error", event_types_received)
        
        log_msg = next(m for m in received if m['eventType'] == 'log_entry')
        self.assertEqual(log_msg['payload']['level'], "info")
        self.assertEqual(log_msg['payload']['message'], "Integration log test")
        
        result_msg = next(m for m in received if m['eventType'] == 'task_result')
        self.assertEqual(result_msg['payload']['status'], "completed")
        self.assertEqual(result_msg['payload']['result_data'], {"data": "all_good"})

if __name__ == '__main__':
    unittest.main() 