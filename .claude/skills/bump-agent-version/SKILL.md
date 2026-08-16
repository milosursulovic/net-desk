---
name: bump-agent-version
description: Use before committing any change under service/ (the C# Windows agent) in net-desk - the agent version string must be bumped or the auto-update flow silently never offers the new build to the fleet. Trigger whenever files under service/ have been modified and a commit is about to happen.
---

# Bumping the agent version (net-desk)

Any commit touching `service/` (the Netdesk Agent C#/.NET Framework 4.5.2
Windows service) must bump the version string first.

## Where

`service/Netdesk.Agent.Common/AgentVersionInfo.cs`:

```csharp
public static class AgentVersionInfo
{
    public const string Current = "1.5.7";
}
```

Bump this (patch/minor as appropriate for the size of the change) whenever
any file under `service/` changes as part of the work being committed.

## Why this matters

The auto-update flow (`Netdesk.Agent.Common/Update/UpdateManager.cs` on the
agent side, `agentReleases.service.js` on the backend) compares this version
string against the currently-installed agent's reported version to decide
whether an update is available. If the source changes but this string
doesn't, a rebuilt/re-uploaded release package looks identical to what's
already deployed — the fleet never gets offered the update, and the bug
goes unnoticed until someone manually checks a machine's running version.

This is a deliberately separate step from a normal semver bump: the
frontend's own version (`frontend/package.json`) is bumped automatically by
tooling and needs no manual action — only the agent's version is manual,
and only because it's compiled into a Windows Service binary, not read from
a manifest at runtime.

## Checklist before committing service/ changes

1. Confirm at least one non-trivial file under `service/` actually changed
   (not just e.g. a comment-only `.md` edit in `service/README.md`).
2. Bump `AgentVersionInfo.Current`.
3. If a Visual Studio/MSBuild environment is available, `dotnet build -c
   Release` from `service/` to confirm all four projects still compile.
