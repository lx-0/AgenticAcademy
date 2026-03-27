# Lesson 4.5: Agent Sandboxing and Isolation

**Module**: 4 — Risk Assessment and Agent Boundaries
**Estimated reading time**: ~18 minutes
**Level**: Intermediate–Advanced

---

## Overview

Sandboxing provides hard boundaries around agent execution — limiting what the agent can access at the infrastructure level, independent of the agent's own code or the guardrails applied to it. This lesson covers sandboxing architectures appropriate for different risk levels, from minimal to air-gapped.

---

## The Sandboxing Spectrum

```
More Trust ←──────────────────────────────────────→ Less Trust

Shared process    Container    VM     Air-gap    Ephemeral
(minimal)        isolation  isolation  sandbox   clean-room
    │               │          │         │           │
    ▼               ▼          ▼         ▼           ▼
No separation    Process    Kernel    Physical    No state
between agents   boundary   boundary  separation  persistence
```

Choose the sandboxing level based on the agent's risk profile. Not every agent needs an air-gapped sandbox; many do not need more than container isolation.

---

## Level 1: Container Isolation

**Appropriate for**: Standard production agents with medium blast radius, connecting to internal systems.

**What it provides**:
- Process namespace isolation (agent cannot see other processes)
- Filesystem isolation (agent has its own root filesystem)
- Network namespace isolation (agent's network traffic is separately routable)
- Resource limits (CPU, memory, disk I/O can be capped per container)

**Kubernetes implementation**:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: invoice-processing-agent
spec:
  containers:
  - name: agent
    image: agents/invoice-processor:v1.2.0
    resources:
      limits:
        cpu: "500m"
        memory: "512Mi"
      requests:
        cpu: "200m"
        memory: "256Mi"
    securityContext:
      runAsNonRoot: true
      runAsUser: 10001
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true  # Agent cannot write to its container filesystem
      capabilities:
        drop:
          - ALL             # Drop all Linux capabilities
    volumeMounts:
    - name: tmp-workspace
      mountPath: /tmp       # Writable temp space only
    env:
    - name: AGENT_ID
      value: "invoice-processing-agent"
  volumes:
  - name: tmp-workspace
    emptyDir:
      sizeLimit: 100Mi      # Limit temp storage to 100MB
  automountServiceAccountToken: false  # No Kubernetes API access
```

---

## Level 2: VM Isolation

**Appropriate for**: Agents with high blast radius that handle sensitive data, especially where the agent executes code (code execution agents, CI/CD agents, shell-running agents).

**What it provides**:
- Kernel-level isolation (agent cannot exploit kernel vulnerabilities to escape to host)
- Hardware-virtualized resource limits
- Strong process and memory isolation even against kernel exploitation

**Use case: Code execution agents**

An agent that executes code submitted by users (e.g., a coding assistant that runs tests) must not run in a shared container environment. A malicious code submission could exploit a container escape vulnerability. VM isolation or specialized sandboxes (gVisor, Firecracker) provide hardware-level containment.

```python
class VMIsolatedCodeRunner:
    """
    Runs agent-requested code in an isolated VM.
    Each run gets a fresh VM; no state persists between runs.
    """

    def execute(
        self,
        code: str,
        language: str,
        timeout_seconds: int = 30
    ) -> ExecutionResult:
        # Provision a fresh VM
        vm = self.vm_pool.acquire_fresh_vm()

        try:
            # Transfer code to isolated environment
            vm.write_file("/sandbox/code.py", code)

            # Execute with strict resource limits
            result = vm.execute(
                command=f"timeout {timeout_seconds} python3 /sandbox/code.py",
                max_output_bytes=1024 * 1024,  # 1MB output limit
                network_access=False            # No network in sandbox
            )

            return ExecutionResult(
                stdout=result.stdout,
                stderr=result.stderr,
                exit_code=result.exit_code,
                execution_time_ms=result.elapsed_ms
            )
        finally:
            # Always destroy the VM — no state persistence
            vm.destroy()
```

---

## Level 3: Air-Gapped Sandbox

**Appropriate for**: Agents processing classified, legally privileged, or highly sensitive data that must not be able to exfiltrate information under any circumstances.

**What it provides**:
- Complete network isolation from the internet and other internal systems
- No outbound network connectivity to any external endpoint
- Data can be sent *in* via controlled ingress, but not *out* except through explicit, monitored egress points

**Architecture**:

```
External World
      │
      │ (no connection)
      │
┌─────┴────────────────────────────────────────────────────┐
│  Air-Gapped Sandbox Environment                          │
│                                                          │
│  [Document Input]──→ [Agent Process] ──→ [Output Buffer] │
│                           │                    │         │
│                     [Internal APIs]      [Human Review]  │
│                       (no internet)       before export  │
└──────────────────────────────────────────────────────────┘
```

**Use case: Legal document review**

A law firm's document review agent processes discovery documents that may contain privileged communications. The agent must not be able to exfiltrate document content. Air-gapped sandbox ensures:
- No outbound API calls to external LLMs (model is deployed on-premises)
- No email or file transfer tools available
- Output is written to an internal buffer, reviewed by a human before any export

---

## Level 4: Ephemeral Clean-Room Execution

**Appropriate for**: Agents that must have zero state persistence between tasks — typically for GDPR compliance or when processing highly sensitive one-time data.

**What it provides**:
- No filesystem state persists between runs
- No in-memory state (fresh process for every run)
- Credentials are provisioned just-in-time and expire when the run completes
- Even the system logs are ephemeral (streamed to external logging, not stored locally)

```python
class EphemeralAgentRunner:
    """
    Each run gets a fully fresh execution environment.
    No state (files, memory, credentials) persists after run completion.
    """

    def run(self, task: Task, agent_definition: AgentDefinition) -> RunResult:
        # Provision fresh credentials just for this run
        credentials = self.credential_provider.provision_temporary(
            agent_id=agent_definition.agent_id,
            task_id=task.id,
            expires_in_minutes=30
        )

        try:
            # Execute in ephemeral container
            result = self.container_runner.run(
                image=agent_definition.image,
                env={
                    "TASK_DATA": base64.b64encode(task.to_json()).decode(),
                    "AGENT_CREDENTIALS": credentials.to_env_format(),
                    # No persistent volume mounts — all in-memory
                },
                volumes=[],  # No persistent volumes
                network_policy="internal_only"
            )
            return result
        finally:
            # Explicitly revoke credentials even before TTL
            self.credential_provider.revoke(credentials.credential_id)
            # Log that run completed and credentials were revoked
            audit_log.record(
                event_type="ephemeral_run_completed",
                task_id=task.id,
                credentials_revoked=True
            )
```

---

## Choosing the Right Sandboxing Level

| Agent Type | Recommended Level | Rationale |
|-----------|------------------|-----------|
| Internal data processing (no code execution, medium-sensitivity data) | Container isolation | Sufficient isolation, low overhead |
| Customer-facing agent with PII access | Container + network policy | Prevents exfiltration, low latency |
| Code execution agent | VM or gVisor | Container escape risk from user-supplied code |
| Legal/medical document processing | Air-gapped or container + zero internet | Data sensitivity prohibits internet access |
| Financial transaction processing | Container + credential isolation + audit logging | Compliance requirements, not just isolation |
| GDPR-sensitive one-time data processing | Ephemeral clean-room | No state persistence required by regulation |

---

## Summary

- Sandboxing provides hard infrastructure-level boundaries independent of agent code or guardrails
- Four levels: container isolation (standard), VM isolation (code execution), air-gapped (sensitive data), ephemeral clean-room (no state persistence)
- Container isolation: process/filesystem/network namespace separation, resource limits, read-only filesystem, dropped Linux capabilities
- VM isolation: kernel-level separation for code execution agents — prevents container escape exploitation
- Air-gapped: complete network isolation for sensitive document processing
- Ephemeral: zero state persistence for GDPR compliance and one-time sensitive data processing
- Choose based on risk profile, not by default to the most restrictive option

---

*Proceed to the [Module 4 Lab](lab.md) to apply these concepts.*
