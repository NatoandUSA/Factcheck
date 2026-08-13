# Multi-Agent Automation Implementation Plan

This plan outlines the architecture for transforming OmniSeller Studio into a fully autonomous, multi-agent platform where AI workers run continuously in the background to grow your Amazon and Etsy business.

## Goal
Build an **Agent Hub** directly into your application. We will deploy specialized "AI Employees" that run autonomously on your backend, passing tasks to each other. 

## User Review Required
> [!IMPORTANT]
> The AI Listing Drafter agent will need to generate text. To avoid unexpected API costs running in a continuous background loop, I propose using our **Smart Local Fallback Engine** (the high-converting mock generator we built earlier) for the initial implementation. 
> We can easily switch it to use your real Gemini API key once you are comfortable with the loop. Is this acceptable for the first version?

## Proposed Changes

### 1. Backend Database & Task Runner (The Agent Engine)
We will upgrade `server.js` to act as an orchestrator for background agents.

#### [MODIFY] `server/server.js`
*   **New Tables:** 
    *   `agents`: Tracks agent state (Online/Offline, Role, Last Active).
    *   `agent_logs`: A live ledger of what the agents are thinking and doing.
    *   `market_trends`: A staging table where the Researcher agent dumps its findings.
*   **The Trend Scout Agent:** A background interval that wakes up, researches trending keywords for your 4 categories (Jewelry, Acrylic, Blanket, Embroidery), and saves them to `market_trends`.
*   **The Listing Drafter Agent:** A background interval that watches `market_trends`. When it sees a hot new trend, it automatically drafts a highly optimized Amazon/Etsy listing and drops it into the `listings` table under `NEEDS_QA` status.
*   **New API Endpoints:** `/api/agents` (list agents), `/api/agents/:id/toggle` (start/stop), `/api/agents/logs` (view live activity).

### 2. Frontend Interface (The Agent Hub)
We will build a command center where you, as the Owner/Manager, can manage your AI workforce.

#### [NEW] `src/components/AgentHub.jsx`
*   **Agent Cards:** Visual cards for your autonomous workers (e.g., "Trend Scout", "Auto-Drafter") showing their current status (Running / Sleeping).
*   **Live Console:** A terminal-like window displaying real-time logs of the agents communicating and executing tasks.

#### [MODIFY] `src/App.jsx` & `src/components/Header.jsx`
*   Add navigation linking to the new **Agent Hub**.

## Verification Plan
### Manual Verification
1. I will start the backend server with the new Agent Engine.
2. We will navigate to the new Agent Hub in the UI.
3. We will toggle the "Trend Scout" and "Auto-Drafter" to **ONLINE**.
4. We will watch the live console as they communicate, and verify that brand new listings autonomously appear in your "Awaiting Manager Approval" queue without you clicking a single button.
