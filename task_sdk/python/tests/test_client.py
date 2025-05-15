import unittest
from unittest.mock import patch, MagicMock
import os
import datetime
import requests

# Adjust the path to import OrcaTaskClient from the src directory
import sys
# Предполагается, что этот скрипт находится в task_sdk/python/tests/
# а OrcaTaskClient в task_sdk/python/src/orca_task_sdk/client.py
# sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../src')))
# Вместо этого, если тесты запускаются из task_sdk/python/, src будет в sys.path при использовании `python -m unittest discover`
# или если setup.py используется для установки пакета в режиме редактирования.
# Для простоты предположим, что src/orca_task_sdk доступен в PYTHONPATH или через установку.

from orca_task_sdk.client import OrcaTaskClient

class TestOrcaTaskClient(unittest.TestCase):

    def setUp(self):
        self.test_callback_url = "http://mock-listener:1234/callback"
        self.test_task_id = "test-task-001"

    @patch.dict(os.environ, {"PARENT_NODE_CALLBACK_URL": "http://env-url:5678", "ORCA_TASK_ID": "env-task-id"})
    def test_init_from_env_vars(self):
        client = OrcaTaskClient()
        self.assertEqual(client.callback_url, "http://env-url:5678")
        self.assertEqual(client.task_id, "env-task-id")

    def test_init_with_direct_args(self):
        client = OrcaTaskClient(callback_url=self.test_callback_url, task_id=self.test_task_id)
        self.assertEqual(client.callback_url, self.test_callback_url)
        self.assertEqual(client.task_id, self.test_task_id)
    
    @patch.dict(os.environ, {}, clear=True) # Ensure no env vars are present for this test
    def test_init_fallback_url_and_id(self):
        with patch('builtins.print') as mock_print: # Suppress warnings for this test
            client = OrcaTaskClient()
            self.assertEqual(client.callback_url, "http://127.0.0.1:3000/mock_orca_callback")
            self.assertEqual(client.task_id, "unknown_orca_task")
            self.assertGreater(mock_print.call_count, 0) # Check that warnings were printed

    @patch('orca_task_sdk.client.requests.post')
    def test_send_message_success(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "received"}
        mock_post.return_value = mock_response

        client = OrcaTaskClient(callback_url=self.test_callback_url, task_id=self.test_task_id)
        event_type = "test_event"
        payload = {"data": "some_value"}
        
        response = client._send_message(event_type, payload)

        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        self.assertEqual(args[0], self.test_callback_url)
        sent_json = kwargs['json']
        self.assertEqual(sent_json['taskId'], self.test_task_id)
        self.assertEqual(sent_json['eventType'], event_type)
        self.assertEqual(sent_json['payload'], payload)
        self.assertTrue("timestamp" in sent_json)
        self.assertIsNotNone(response)
        self.assertEqual(response["status"], "received")

    @patch('orca_task_sdk.client.requests.post')
    def test_send_message_http_error(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError("Server Error")
        mock_post.return_value = mock_response

        client = OrcaTaskClient(callback_url=self.test_callback_url, task_id=self.test_task_id)
        with patch('builtins.print') as mock_print: # To check error logging
            response = client._send_message("error_event", {"detail": "bad stuff"})
            self.assertIsNone(response)
            mock_print.assert_any_call("OrcaTaskSDK: Error sending message type error_event: Server Error")

    @patch('orca_task_sdk.client.requests.post')
    def test_send_status_update(self, mock_post):
        client = OrcaTaskClient(callback_url=self.test_callback_url, task_id=self.test_task_id)
        client._send_message = MagicMock() # Mock the internal method

        client.send_status_update("testing", progress=50)
        client._send_message.assert_called_once_with("status_update", {"message": "testing", "progress": 50})
        
        client._send_message.reset_mock()
        client.send_status_update("no progress")
        client._send_message.assert_called_once_with("status_update", {"message": "no progress"})

    @patch('orca_task_sdk.client.requests.post')
    def test_send_log_entry(self, mock_post):
        client = OrcaTaskClient(callback_url=self.test_callback_url, task_id=self.test_task_id)
        client._send_message = MagicMock()

        client.send_log_entry("info", "info message", details={"a":1})
        client._send_message.assert_called_once_with("log_entry", {"level": "info", "message": "info message", "details": {"a":1}})
        
        client._send_message.reset_mock()
        client.send_log_entry("error", "error message")
        client._send_message.assert_called_once_with("log_entry", {"level": "error", "message": "error message"})

    @patch('orca_task_sdk.client.requests.post')
    def test_send_task_result(self, mock_post):
        client = OrcaTaskClient(callback_url=self.test_callback_url, task_id=self.test_task_id)
        client._send_message = MagicMock()

        client.send_task_result("completed", result_data={"res": "ok"})
        client._send_message.assert_called_once_with("task_result", {"status": "completed", "result_data": {"res": "ok"}})
        
        client._send_message.reset_mock()
        client.send_task_result("failed", error_message="it borked")
        client._send_message.assert_called_once_with("task_result", {"status": "failed", "result_data": {}, "error_message": "it borked"})

    @patch('orca_task_sdk.client.requests.post')
    def test_send_task_error(self, mock_post):
        client = OrcaTaskClient(callback_url=self.test_callback_url, task_id=self.test_task_id)
        client._send_message = MagicMock()

        client.send_task_error("test error", error_details={"type": "TestFail"}, stack_trace="trace")
        client._send_message.assert_called_once_with("task_error", {"message": "test error", "error_details": {"type": "TestFail"}, "stack_trace": "trace"})

if __name__ == '__main__':
    unittest.main() 