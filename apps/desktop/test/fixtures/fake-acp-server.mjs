/**
 * Speaks a tiny slice of the Agent Client Protocol so the warm-session
 * client can be tested without starting Cursor.
 */
let buffer = "";
let sessions = 0;
let permSeq = 100;
let waiting = null;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function promptText(message) {
  const blocks = message.params?.prompt;
  if (!Array.isArray(blocks)) return "";
  return blocks.map((block) => block?.text ?? "").join("");
}

function onMessage(message) {
  if (waiting && message.id === waiting.permId && !message.method) {
    const optionId = message.result?.outcome?.optionId;
    const limited = waiting.text.includes("LIMIT");
    const text = limited
      ? "ActionRequiredError: Weekly usage limit reached. It resets in 3 days. Buy credits to keep going."
      : optionId === "no"
        ? `pid:${process.pid}`
        : "bad-permission";
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: waiting.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text },
        },
      },
    });
    send({
      jsonrpc: "2.0",
      id: waiting.promptId,
      result: { stopReason: "end_turn" },
    });
    waiting = null;
    return;
  }

  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: { sessionCapabilities: {} },
      },
    });
    return;
  }

  if (message.method === "session/new") {
    sessions += 1;
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        sessionId: `s-${sessions}`,
        modes: {
          currentModeId: "agent",
          availableModes: [
            { id: "ask", name: "Ask" },
            { id: "agent", name: "Agent" },
          ],
        },
      },
    });
    return;
  }

  if (
    message.method === "session/set_mode" ||
    message.method === "session/set_model"
  ) {
    send({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }

  if (message.method === "session/prompt") {
    const permId = permSeq++;
    waiting = {
      permId,
      promptId: message.id,
      sessionId: message.params?.sessionId,
      text: promptText(message),
    };
    send({
      jsonrpc: "2.0",
      id: permId,
      method: "session/request_permission",
      params: {
        sessionId: waiting.sessionId,
        options: [
          { optionId: "allow", kind: "allow_once", name: "Allow" },
          { optionId: "no", kind: "reject_once", name: "Reject" },
        ],
      },
    });
  }
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf("\n");
  while (newline >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) {
      try {
        onMessage(JSON.parse(line));
      } catch {
        // Ignore non-protocol noise.
      }
    }
    newline = buffer.indexOf("\n");
  }
});
