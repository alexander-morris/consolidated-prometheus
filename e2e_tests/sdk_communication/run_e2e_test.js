const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '../..');
const E2E_DIR = __dirname; 
// const SDK_TS_DIR = path.join(ROOT_DIR, 'task_sdk', 'typescript'); // Not needed if E2E tsconfig compiles SDK src

const TASK_JS_OUTPUT_DIR = path.join(E2E_DIR, 'dist_e2e_output'); // Updated output dir
const TASK_JS_PATH = path.join(TASK_JS_OUTPUT_DIR, 'e2e_tests', 'sdk_communication', 'test_task.js'); // Path will be nested due to rootDir
const E2E_TSCONFIG_PATH = path.join(E2E_DIR, 'tsconfig.task.json');
const MOCK_ORCA_AGENT_PATH = path.join(E2E_DIR, 'mock_orca_agent.py');

const LOG_LINE_PREFIX = 'E2E_NAMESPACE_LOG:::';

// function compileSdk() { ... } // compileSdk is no longer strictly needed if E2E tsconfig handles SDK src

function compileTestTask() {
    console.log('[E2E Orchestrator] Compiling E2E test_task.ts (and referenced SDK src)...');
    try {
        // Clean previous output to ensure fresh compile
        if (fs.existsSync(TASK_JS_OUTPUT_DIR)) {
            fs.rmSync(TASK_JS_OUTPUT_DIR, { recursive: true, force: true });
        }
        execSync(`npx tsc -p "${E2E_TSCONFIG_PATH}"`, { stdio: 'inherit' });
        console.log('[E2E Orchestrator] E2E test_task.ts compilation successful.');
        // Verify the main output file exists
        if (!fs.existsSync(TASK_JS_PATH)) {
            console.error(`[E2E Orchestrator] Compiled output not found at expected path: ${TASK_JS_PATH}`);
            console.error("[E2E Orchestrator] Check tsconfig.task.json 'outDir' and 'rootDir' settings.");
            const expectedDirListing = fs.existsSync(TASK_JS_OUTPUT_DIR) ? fs.readdirSync(TASK_JS_OUTPUT_DIR) : "Output directory does not exist.";
            console.error(`[E2E Orchestrator] Contents of ${TASK_JS_OUTPUT_DIR}:`, expectedDirListing);
            return false;
        }
        return true;
    } catch (error) {
        console.error('[E2E Orchestrator] E2E test_task.ts compilation failed.'); 
        return false;
    }
}

// Scenario S1 is now part of Scenario S3 for a more complete flow
async function runTestScenario_S3_SingleMessage() {
    console.log('\n[E2E Orchestrator] Starting E2E Scenario S3: Single Message (Python SDK -> JS SDK)');
    let taskProcess = null;
    let mockAgentProcess = null;
    let testPassed = false;
    const uniqueTaskId = `e2e_s3_task_${Date.now()}`;

    try {
        if (!fs.existsSync(TASK_JS_PATH)) {
            throw new Error("test_task.js not found. Compilation must have failed earlier.");
        }

        console.log(`[E2E Orchestrator] Spawning JS Task: node ${TASK_JS_PATH}`);
        taskProcess = spawn('node', [TASK_JS_PATH], {
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'], // Enable IPC
            env: { ...process.env, E2E_ORCA_TASK_ID: uniqueTaskId }
        });

        let receivedExpectedGUILog = false;
        let stdoutBuffer = '';
        taskProcess.stdout.on('data', (data) => {
            stdoutBuffer += data.toString();
            let lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop() || ''; // Handle empty last line

            for (const line of lines) {
                // process.stdout.write(`[TestTask S3 Output] ${line}\n`);
                if (line.includes(LOG_LINE_PREFIX)) {
                    const jsonPart = line.substring(line.indexOf(LOG_LINE_PREFIX) + LOG_LINE_PREFIX.length);
                    try {
                        const logJson = JSON.parse(jsonPart);
                        // Check for the status_update sent by mock_orca_agent via JS SDK
                        if (
                            logJson.action === 'OrcaStatusUpdate' && // Default action for status_update by SDK
                            logJson.message.includes('MockOrcaAgent (direct stdout) reporting: E2E Test Status Update') &&
                            logJson.message.includes('(33%)') &&
                            logJson.level === 'Info' // Default level for status_update
                        ) {
                            receivedExpectedGUILog = true;
                            console.log('[E2E Orchestrator] SUCCESS S3: Verified status_update log from JS SDK.');
                            testPassed = true;
                            if (taskProcess && !taskProcess.killed) taskProcess.kill();
                            if (mockAgentProcess && !mockAgentProcess.killed) mockAgentProcess.kill();
                            break;
                        }
                    } catch (e) {
                        console.warn('[E2E Orchestrator] S3: Failed to parse log line JSON:', jsonPart, e);
                    }
                }
            }
             if (testPassed) { if (taskProcess && !taskProcess.killed) taskProcess.kill(); }
        });
        taskProcess.stderr.on('data', (data) => { console.error(`[TestTask S3 Error] ${data.toString()}`); });
        taskProcess.on('close', (code) => { console.log(`[E2E Orchestrator] S3: JS Task process exited with code ${code}`); });
        taskProcess.on('error', (err) => { console.error('[E2E Orchestrator] S3: Failed to start JS Task process.', err); });

        // Wait for JS task to be ready (listen for its own startup message)
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simple wait for JS task to init IPC listener
        console.log('[E2E Orchestrator] JS Task presumed ready. Spawning Mock Orca Agent...');

        // Spawn mock_orca_agent.py
        mockAgentProcess = spawn('python3', [MOCK_ORCA_AGENT_PATH], {
            env: { ...process.env, ORCA_TASK_ID: uniqueTaskId }
        });

        let agentStdout = '';
        mockAgentProcess.stdout.on('data', (data) => {
            agentStdout += data.toString();
            // Try to parse JSON as it comes in, assuming one JSON object per run
            try {
                const messageFromAgent = JSON.parse(agentStdout.trim());
                console.log('[E2E Orchestrator] S3: Received message from Mock Orca Agent stdout:', messageFromAgent);
                if (taskProcess && taskProcess.send) { // Check if send is available (for IPC)
                    taskProcess.send(messageFromAgent); // Send to JS task via IPC
                    console.log('[E2E Orchestrator] S3: Sent message to JS Task via IPC.');
                } else {
                    console.error("[E2E Orchestrator] S3: taskProcess.send is not available. IPC not configured correctly for child?");
                }
                agentStdout = ''; // Clear buffer after processing
            } catch (e) {
                // console.warn("[E2E Orchestrator] S3: Mock Orca Agent stdout not yet full JSON:", agentStdout);
            }
        });
        mockAgentProcess.stderr.on('data', (data) => { console.error(`[MockOrcaAgent S3 Error] ${data.toString()}`); });
        mockAgentProcess.on('close', (code) => { console.log(`[E2E Orchestrator] S3: Mock Orca Agent process exited with code ${code}`); });

        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                if (!testPassed) {
                    console.error('[E2E Orchestrator] FAIL S3: Test timed out.');
                    if (taskProcess && !taskProcess.killed) taskProcess.kill();
                    if (mockAgentProcess && !mockAgentProcess.killed) mockAgentProcess.kill();
                    reject(new Error("Test S3 timed out"));
                } else { resolve(null); }
            }, 15000); // Increased timeout
            // Resolve/reject when JS task process closes (either by itself or killed)
            taskProcess.on('close', () => { clearTimeout(timeoutId); resolve(null); }); 
        });

    } catch (error) {
        console.error('[E2E Orchestrator] Error during S3 test execution:', error);
    } finally {
        if (taskProcess && !taskProcess.killed) taskProcess.kill();
        if (mockAgentProcess && !mockAgentProcess.killed) mockAgentProcess.kill();
        console.log(`[E2E Orchestrator] Test S3 ${testPassed ? 'PASSED' : 'FAILED'}.`);
        return testPassed;
    }
}

async function runTestScenario_S4_FullSuite() {
    console.log('\n[E2E Orchestrator] Starting E2E Scenario S4: Full Message Suite');
    let taskProcess = null;
    let mockAgentProcess = null;
    let testPassed = false;
    const uniqueTaskId = `e2e_s4_task_${Date.now()}`;
    let receivedLogs = [];
    let expectedMessagesCount = 7; // Number of messages mock_orca_agent.py sends
    let customHandlerLogs = [];

    try {
        if (!fs.existsSync(TASK_JS_PATH)) {
            throw new Error("test_task.js not found for S4. Compilation must have failed.");
        }

        console.log(`[E2E Orchestrator] S4: Spawning JS Task: node ${TASK_JS_PATH}`);
        taskProcess = spawn('node', [TASK_JS_PATH], {
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            env: { ...process.env, E2E_ORCA_TASK_ID: uniqueTaskId }
        });

        let stdoutBuffer = '';
        taskProcess.stdout.on('data', (data) => {
            const output = data.toString();
            // process.stdout.write(`[TestTask S4 RawOut] ${output}`); // Can be very noisy
            stdoutBuffer += output;
            let lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop() || '';

            for (const line of lines) {
                // process.stdout.write(`[TestTask S4 Line] ${line}\n`);
                if (line.includes(LOG_LINE_PREFIX)) {
                    const jsonPart = line.substring(line.indexOf(LOG_LINE_PREFIX) + LOG_LINE_PREFIX.length);
                    try {
                        const logJson = JSON.parse(jsonPart);
                        receivedLogs.push(logJson);
                    } catch (e) {
                        console.warn('[E2E Orchestrator] S4: Failed to parse E2E_NAMESPACE_LOG JSON:', jsonPart, e);
                    }
                } else if (line.includes('[E2E TestTask Custom')) { // Capture custom handler console logs
                    customHandlerLogs.push(line);
                }
            }
        });
        taskProcess.stderr.on('data', (data) => { console.error(`[TestTask S4 Error] ${data.toString()}`); });
        taskProcess.on('error', (err) => { console.error('[E2E Orchestrator] S4: Failed to start JS Task process.', err); });
        taskProcess.on('close', (code) => { console.log(`[E2E Orchestrator] S4: JS Task process exited with code ${code}`); });

        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for JS task to init
        console.log('[E2E Orchestrator] S4: JS Task presumed ready. Spawning Mock Orca Agent (Full Suite)...');

        mockAgentProcess = spawn('python3', [MOCK_ORCA_AGENT_PATH], {
            env: { ...process.env, ORCA_TASK_ID: uniqueTaskId, PYTHONPATH: path.join(E2E_DIR, '..', '..', 'task_sdk', 'python', 'src') }
        });
        
        let agentStdoutBuffer = '';
        mockAgentProcess.stdout.on('data', (data) => {
            agentStdoutBuffer += data.toString();
            let agentLines = agentStdoutBuffer.split('\n');
            agentStdoutBuffer = agentLines.pop() || '';
            for (const agentLine of agentLines) {
                if (agentLine.trim()) { // Ensure line is not empty
                    try {
                        const messageFromAgent = JSON.parse(agentLine.trim());
                        // console.log('[E2E Orchestrator] S4: Msg from Agent:', messageFromAgent.eventType);
                        if (taskProcess && taskProcess.send) {
                            taskProcess.send(messageFromAgent);
                        } else { console.error("S4: taskProcess.send not available.");}
                    } catch (e) {
                        console.warn("[E2E Orchestrator] S4: Mock Orca Agent non-JSON stdout:", agentLine, e);
                    }
                }
            }
        });
        mockAgentProcess.stderr.on('data', (data) => { console.error(`[MockOrcaAgent S4 Error] ${data.toString()}`); });
        mockAgentProcess.on('close', (code) => { 
            console.log(`[E2E Orchestrator] S4: Mock Orca Agent exited with code ${code}`);
            // Give a little more time for JS task to process all messages before timeout check
            setTimeout(() => {
                if (taskProcess && !taskProcess.killed) taskProcess.kill(); // All messages sent, kill JS task
            }, 2000);
        });

        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                if (receivedLogs.length < expectedMessagesCount) { // Check if enough messages were processed
                    console.error(`[E2E Orchestrator] FAIL S4: Test timed out. Received ${receivedLogs.length}/${expectedMessagesCount + 1} expected logs (incl. startup).`);
                }
                if (taskProcess && !taskProcess.killed) taskProcess.kill();
                if (mockAgentProcess && !mockAgentProcess.killed) mockAgentProcess.kill();
                reject(new Error("Test S4 timed out"));
            }, 20000); // Increased timeout for full suite

            taskProcess.on('close', () => {
                clearTimeout(timeoutId);
                // Verification after JS task closes
                console.log("[E2E Orchestrator] S4: Verifying received logs...");
                console.log(`[E2E Orchestrator] S4: Total E2E_NAMESPACE_LOGs captured: ${receivedLogs.length}`);
                // Expected: 1 E2ETaskStartS4, 1 SDKLoggerInit, + 7 from mock agent (default handlers) + 1 custom result = 10
                // Note: default handler for status_update runs, custom one only console.logs.
                // Custom task_result handler also calls _loggerCallback.

                const actions = receivedLogs.map(l => l.action);
                console.log("[E2E Orchestrator] S4: Actions received by MockNamespace:", actions);

                let checksPassed = true;
                if (!actions.includes("E2ETaskStartS4")) { console.error("FAIL S4: Missing E2ETaskStartS4"); checksPassed = false; }
                if (!actions.includes("SDKLoggerInit")) { console.error("FAIL S4: Missing SDKLoggerInit"); checksPassed = false; }
                if (!actions.includes("OrcaStatusUpdate")) { console.error("FAIL S4: Missing OrcaStatusUpdate"); checksPassed = false; }
                if (!actions.includes("OrcaLogEntry")) { console.error("FAIL S4: Missing OrcaLogEntry"); checksPassed = false; }
                if (!actions.includes("OrcaTaskError")) { console.error("FAIL S4: Missing OrcaTaskError"); checksPassed = false; }
                if (!actions.includes("OrcaTaskResult")) { console.error("FAIL S4: Missing OrcaTaskResult from default handler"); checksPassed = false; }
                if (!actions.includes("E2ECustomResultComplete")) { console.error("FAIL S4: Missing E2ECustomResultComplete from custom handler"); checksPassed = false; }
                
                // Check custom handler console logs (approximate check)
                if (!customHandlerLogs.some(log => log.includes("Custom Status Handler"))) { console.error("FAIL S4: Missing custom status handler log"); checksPassed = false; }
                if (!customHandlerLogs.some(log => log.includes("Custom Result Handler"))) { console.error("FAIL S4: Missing custom result handler log"); checksPassed = false; }

                // Count specific events (rough check)
                const statusUpdates = receivedLogs.filter(l=>l.action === "OrcaStatusUpdate").length;
                if (statusUpdates < 2) { console.error(`FAIL S4: Expected at least 2 OrcaStatusUpdate, got ${statusUpdates}`); checksPassed = false;}
                
                testPassed = checksPassed;
                resolve(null);
            });
        });

    } catch (error) {
        console.error('[E2E Orchestrator] Error during S4 test execution:', error);
    } finally {
        if (taskProcess && !taskProcess.killed) taskProcess.kill();
        if (mockAgentProcess && !mockAgentProcess.killed) mockAgentProcess.kill();
        console.log(`[E2E Orchestrator] Test S4 ${testPassed ? 'PASSED' : 'FAILED'}.`);
        return testPassed;
    }
}

async function main() {
    let allPassed = true;
    // compileSdk() is no longer called here as E2E tsconfig compiles SDK src files needed.
    if (!compileTestTask()) {
      console.error("[E2E Orchestrator] Test task compilation failed. Aborting tests.");
      process.exit(1);
    }
    // Run S3 which incorporates S1 and S2 logic
    if (!(await runTestScenario_S3_SingleMessage())) {
        allPassed = false;
    }
    if (!(await runTestScenario_S4_FullSuite())) {
        allPassed = false;
    }
    if (allPassed) {
        console.log('\n[E2E Orchestrator] All E2E scenarios executed. Check results above.');
        process.exit(0);
    } else {
        console.error('\n[E2E Orchestrator] Some E2E scenarios FAILED.');
        process.exit(1);
    }
}

main().catch(e => {
  console.error("[E2E Orchestrator] Unhandled error in main orchestrator:", e);
  process.exit(1);
}); 