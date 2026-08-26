# Graph Report - net-desk  (2026-08-27)

## Corpus Check
- 440 files · ~259,167 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3193 nodes · 7986 edges · 176 communities (150 shown, 26 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 344 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- IP Metadata Controllers
- PDSU Analytics Export Controllers
- IP Addresses Controller
- Math/Chart Utilities
- Agent Detail View
- Agent Job Executor & State (C#)
- Flagged Software/Driver Controllers
- Agent Releases View
- Backend App Bootstrap
- Agent Common Namespaces (C#)
- Shared UI Components (VNC/Dialogs)
- Auth & Users Controllers
- Agent/Manager Auth Middleware
- PDSU Repository
- PDSU Uptime Timeline
- Agents List View
- Hardware Inventory Collector (C#)
- Agents Controller
- Server Health Controller
- Printers Controller
- Agent Jobs Controller
- Test DB Helpers
- Agents Repository
- Printers View
- PDSU Controller
- IP PDSU View
- Agent Enroll/Heartbeat Controllers
- PDSU Analytics View
- Role & Cache Middleware
- Inventory Data Models (C#)
- Project Docs & Agent Skills
- Inventory Controller
- C# Primitive Type References
- DNS Logs View
- Home View
- Win32 Interop Types (C#)
- Agent Releases Repository
- Server Health View
- Manager Worker Install Flow (C#)
- Inventory View
- Batch Job Detail View
- Agent Monitoring History Repo
- Manager API Client Models (C#)
- DNS Logs Controller/DTO
- Manager Jobs Controller/Repo
- VNC Session View
- Push Subscriptions (VAPID)
- Agent Releases Controller
- Manager API Client (C#)
- Export Utilities (PDF/XLSX)
- SSL Config & IP Status History
- PDSU Updates View
- Service FileLogger (C#)
- Notifications Controller/Repo
- Manager FileLogger (C#)
- Backend NPM Dependencies
- CORS & Env Config
- Daily Reports Controller/Repo
- Deployment Groups Controller
- PDSU Overview View
- PDSU Printers View
- Reports View
- Free IP Addresses View
- Activity Log & Event Logs
- VNC Sessions Controller/Repo
- Architecture Decision Notes
- Frontend Lint Dependencies
- Add IP Entry View
- Downloads Folder View
- Inventory/Security Posture Collectors (C#)
- Managers Controller/DTO
- Event Log Bookmarks (C#)
- Batch Jobs View
- IP Port Scan View
- App Settings Controller/DTO/Repo
- Backend Dev/Test Dependencies
- Roadmap Ideas & Removed Prototypes
- Frontend NPM Dependencies
- PDSU Flagged View
- Edit IP Entry View
- Computers For Repack View
- Downloads Folder Backend
- Repack Recommendations View
- Manager Windows Service (C#)
- VNC Bridge (C#)
- PDSU Services View
- PDSU Software View
- Abortable Fetch Composable
- Current Site & Duplicate Names
- Computers Without Agent View
- Service Solution/Project Config
- Process Detections Backend
- Frontend App Bootstrap
- App Footer & Layout
- PDSU Drivers View
- Paginated Route Composable
- Process Detections View
- Software Inventory Collector (C#)
- Change Password Component
- Agent Jobs DTO
- Theme Init & Dark Mode
- MultiSelect Component
- Site Switcher
- Theme Toggle Component
- Config View
- Logs View
- Agent Detail Job Actions
- Backend Package Metadata
- Domain Blacklist Sync Service
- Agent Update & Signing Docs
- Frontend NPM Scripts
- Group Select Component
- Push Notification Toggle
- Login View
- PDSU Service Label Helpers
- Frontend Test Setup Mocks
- Manager DirectorySync (C#)
- ESLint Ignore Patterns
- Deployment Group Picker
- IP Entry Fields Constants
- Agent Detail Manager Actions
- Agent DirectorySync (C#)
- Manager Update Report Client (C#)
- Update Check & Semver
- Backend NPM Scripts
- Trend Analysis Utility
- Frontend Auth Utilities
- Agent Signing Cert Utility
- JS Config Path Aliases
- App Nav Component
- Logout Button Component
- Notification Ticker Component
- Select Site View
- Job Models (C#)
- Heartbeat Models (C#)
- Agent Windows Service (C#)
- Frontend Package Metadata
- Prettier Config
- Manager Network Info (C#)
- DB Migration Workflow Docs
- Agent Version Constant (C#)
- Current User Composable
- PDSU Formatters Composable
- Agent Command Constants
- Agents View Filter Helpers
- PDSU Analytics Fetch Helpers
- Breadcrumbs Component
- Toast Notification Composable
- bcryptjs Dependency
- DejaVu Fonts Dependency
- ExcelJS Dependency
- Express Dependency
- Helmet Dependency
- Multer Dependency
- MySQL2 Dependency
- p-limit Dependency
- PDFKit Dependency
- web-push Dependency
- Zod Dependency
- jsdom Dependency
- Vite Dependency
- vite-plugin-pwa Dependency
- @vitejs/plugin-vue Dependency
- PWA App Icons
- Download Blob Utility
- Search Clear Helpers
- App Icon Asset (512x512)
- App Icon Asset (netdesk.png)
- Vue Logo Asset

## God Nodes (most connected - your core abstractions)
1. `fetchWithAuth()` - 189 edges
2. `badRequest()` - 116 edges
3. `parseError()` - 96 edges
4. `parseIdParam()` - 90 edges
5. `notFound()` - 81 edges
6. `pool` - 55 edges
7. `NetDesk TECHNICAL.md` - 44 edges
8. `pdsuAnalyticsStatsService()` - 35 edges
9. `NetdeskApiClient` - 32 edges
10. `ManagerWorker` - 32 edges

## Surprising Connections (you probably didn't know these)
- `NetDesk TECHNICAL.md` --references--> `isFeatureEnabled()`  [EXTRACTED]
  docs/TECHNICAL.md → backend/services/appSettings.service.js
- `Netdesk.Agent.Updater (legacy separate update process)` --conceptually_related_to--> `Netdesk Agent Manager (NetdeskAgentManager Service)`  [AMBIGUOUS]
  CLAUDE.md → service/README.md
- `NetDesk TECHNICAL.md` --references--> `Daily Report Trend/Anomaly Detection`  [EXTRACTED]
  docs/TECHNICAL.md → README.md
- `NetDesk TECHNICAL.md` --references--> `PWA Push Notifications (VAPID/web-push)`  [EXTRACTED]
  docs/TECHNICAL.md → README.md
- `netdesk-researcher Agent` --references--> `computer_metadata table`  [EXTRACTED]
  .claude/agents/netdesk-researcher.md → docs/TECHNICAL.md

## Import Cycles
- 3-file cycle: `frontend/src/composables/useCurrentUser.js -> frontend/src/utils/fetchWithAuth.js -> frontend/src/router/index.js -> frontend/src/composables/useCurrentUser.js`

## Hyperedges (group relationships)
- **Agent Auto-Update Workflow** — claude_skills_bump_agent_version_skill_doc, service_netdesk_agent_common_agentversioninfo_current, concept_agent_auto_update_flow, service_netdesk_agent_common_update_updatemanager, backend_services_agentreleases_service [EXTRACTED 1.00]
- **DNS Query Logging Pipeline** — concept_dns_query_logging_evolution, service_netdesk_agent_common_dnslogs_dnsquerycollector, service_netdesk_agent_common_dnslogs_windivertinterop, concept_windivert_dual_license, db_computer_dns_queries [EXTRACTED 1.00]
- **Netdesk Agent Manager Update Mechanism** — concept_netdesk_agent_manager, service_netdesk_agent_common_update_updatemanager, concept_agent_auto_update_flow, frontend_src_constants_powershellpresets [INFERRED 0.85]

## Communities (176 total, 26 thin omitted)

### Community 0 - "IP Metadata Controllers"
Cohesion: 0.06
Nodes (74): getMetadataByIpController(), patchMetadataByIpController(), requireValidIp(), upsertMetadataByIpController(), clearMetadataController(), exportComputerMetadataPdfController(), exportWithoutMetadataPdfController(), listMetadataController() (+66 more)

### Community 1 - "PDSU Analytics Export Controllers"
Cohesion: 0.07
Nodes (71): exportActivePrintersPdfController(), exportPdsuAnalyticsController(), exportWithoutNetdeskAgentManagerPdfController(), exportWithoutPdsuPdfController(), exportWithoutUltravncPdfController(), listWithoutNetdeskAgentManagerController(), listWithoutPdsuController(), listWithoutUltravncController() (+63 more)

### Community 2 - "IP Addresses Controller"
Cohesion: 0.06
Nodes (66): createController(), deleteController(), duplicatesController(), exportXlsxController(), filterOptionsController(), freeIpAddressesController(), getByIdController(), listController() (+58 more)

### Community 3 - "Math/Chart Utilities"
Cohesion: 0.05
Nodes (60): avg(), barWidth(), groupCount(), joinNonEmpty(), maxOf(), median(), round1(), sum() (+52 more)

### Community 4 - "Agent Detail View"
Cohesion: 0.03
Nodes (53): activeReleaseOptions, agent, cancellingJobId, { confirmState, askConfirm, resolveConfirm }, connectivityBadgeClass, connectivityLabel, creatingJob, deploymentGroupOptions (+45 more)

### Community 5 - "Agent Job Executor & State (C#)"
Cohesion: 0.10
Nodes (17): ExecutionResult, List, AgentSettings, AgentState, HttpClient, JsonSerializerSettings, Task, NetdeskApiClient (+9 more)

### Community 6 - "Flagged Software/Driver Controllers"
Cohesion: 0.08
Nodes (52): createFlaggedDriverController(), createFlaggedServiceController(), createFlaggedSoftwareController(), deleteFlaggedDriverController(), deleteFlaggedServiceController(), deleteFlaggedSoftwareController(), listAgentsForFlaggedDriverController(), listAgentsForFlaggedServiceController() (+44 more)

### Community 7 - "Agent Releases View"
Cohesion: 0.05
Nodes (46): askConfirm(), AgentReleasesView(), parseError(), addDeploymentGroup(), confirmDelete(), confirmRevoke(), loadAgent(), removeDeploymentGroup() (+38 more)

### Community 8 - "Backend App Bootstrap"
Cohesion: 0.09
Nodes (34): createApp(), __dirname, FRONTEND_DIST, JWT_SECRET, setupLogger(), errorHandler(), notFound(), createUser() (+26 more)

### Community 9 - "Agent Common Namespaces (C#)"
Cohesion: 0.06
Nodes (29): NetdeskAgent.Common.Inventory, NetdeskAgent.Common.Models, NetdeskAgent.Common.Update, NetdeskAgent.Common.Monitoring, NetdeskAgent.Common.ProcessMonitor, NetdeskAgent.Common.EventLogs, NetdeskAgent.Common.Manager, NetdeskAgent.Common.Logging (+21 more)

### Community 10 - "Shared UI Components (VNC/Dialogs)"
Cohesion: 0.05
Nodes (35): emit, props, router, useConfirmDialog(), DeploymentGroupsView(), GroupsView(), UsersView(), adding (+27 more)

### Community 11 - "Auth & Users Controllers"
Cohesion: 0.09
Nodes (38): JWT_EXPIRES_IN, changePasswordController(), loginController(), meController(), createUserController(), deleteUserController(), listUsersController(), ChangePasswordSchema (+30 more)

### Community 12 - "Agent/Manager Auth Middleware"
Cohesion: 0.10
Nodes (27): AGENT_ENROLL_TOKEN, MANAGER_ENROLL_TOKEN, authenticateAgent(), parseBearer(), requireEnrollToken(), authenticateManager(), parseBearer(), requireManagerEnrollToken() (+19 more)

### Community 13 - "PDSU Repository"
Cohesion: 0.11
Nodes (40): computerAvailableUpdatesDelete(), computerAvailableUpdatesInsert(), computerAvailableUpdatesList(), computerDriversDelete(), computerDriversInsert(), computerDriversList(), computerFindById(), computerFindByIp() (+32 more)

### Community 14 - "PDSU Uptime Timeline"
Cohesion: 0.07
Nodes (36): fmtDate(), hovered, props, rangeLabel, segments, IpMetaView(), fmtDateOnly(), fmtDateSr() (+28 more)

### Community 15 - "Agents List View"
Cohesion: 0.05
Nodes (34): activeDetailedFilterCount, allVisibleSelected, assigningDeploymentGroup, batchForm, batchOnlyOnline, batchSelectedPresetId, { confirmState, askConfirm, resolveConfirm }, CONNECTIVITY_LABELS (+26 more)

### Community 16 - "Hardware Inventory Collector (C#)"
Cohesion: 0.13
Nodes (9): ManagementBaseObject, ManagementObject, List, List, HardwareCollector, StorageInfo, List, WmiUtils (+1 more)

### Community 17 - "Agents Controller"
Cohesion: 0.10
Nodes (37): listJobBatchesController(), listUpdateLogController(), addAgentDeploymentGroupController(), addAgentsDeploymentGroupController(), agentFilterOptionsController(), CONNECTIVITY_FILTERS, dateFilter(), deleteAgentController() (+29 more)

### Community 18 - "Server Health Controller"
Cohesion: 0.10
Nodes (33): auditGhostReferencesController(), cleanGhostReferencesController(), getLiveServerHealthController(), listServerHealthHistoryController(), timed(), requestMetricsMiddleware(), auditGhostReferences(), cleanGhostReferences() (+25 more)

### Community 19 - "Printers Controller"
Cohesion: 0.13
Nodes (37): connectController(), createPrinterController(), deletePrinterController(), disconnectController(), exportXlsxPrintersController(), getPrinterController(), listPrintersController(), setHostController() (+29 more)

### Community 20 - "Agent Jobs Controller"
Cohesion: 0.14
Nodes (36): cancelBatchController(), cancelJobController(), clearJobsController(), createBatchJobController(), createJobController(), getBatchStatusController(), listJobsController(), pollJobsController() (+28 more)

### Community 21 - "Test DB Helpers"
Cohesion: 0.14
Nodes (17): pool, linkAgentToIpEntry(), enrollAgent(), ingestDnsQueries(), createService(), deleteTestAgent(), deleteTestDailyReport(), deleteTestIpEntry() (+9 more)

### Community 22 - "Agents Repository"
Cohesion: 0.11
Nodes (36): listDistinctReleaseDeploymentGroups(), buildAgentsWhereClause(), deleteAgentById(), findAgentIpEntry(), findAgentMonitoring(), findAgentWindowsUpdateStatus(), listAgentIds(), listAgents() (+28 more)

### Community 23 - "Printers View"
Cohesion: 0.07
Nodes (34): PrintersView(), clearSearch(), confirmDelete(), { confirmState, askConfirm, resolveConfirm }, connectComputerFromTools(), disconnectComputerFromTools(), editId, fetchData() (+26 more)

### Community 24 - "PDSU Controller"
Cohesion: 0.15
Nodes (34): addFlaggedExceptionController(), clearPdsuController(), exportComputerPdsuPdfController(), FLAG_KINDS, fmtRowDates(), getAvailableUpdatesController(), getComputerByIpController(), getComputerController() (+26 more)

### Community 25 - "IP PDSU View"
Cohesion: 0.06
Nodes (35): IpPdsuView(), addException(), { confirmState, askConfirm, resolveConfirm }, drivers, entry, entryError, entryLoading, exceptions (+27 more)

### Community 26 - "Agent Enroll/Heartbeat Controllers"
Cohesion: 0.12
Nodes (25): submitJobResultController(), reportUpdateController(), enrollController(), heartbeatController(), inventoryController(), pingController(), setProcessKillExemptController(), createGroupController() (+17 more)

### Community 27 - "PDSU Analytics View"
Cohesion: 0.06
Nodes (31): PDSUAnalyticsView(), activeTab, coverage, drivers, exporting, exportingMissingPdf, exportingWithoutNetdeskAgentManagerPdf, exportingWithoutUltravncPdf (+23 more)

### Community 28 - "Role & Cache Middleware"
Cohesion: 0.16
Nodes (19): cacheNoStore(), readRequiresOperator(), requireRole(), requireRootAdmin(), writeRequiresOperator(), router, router, router (+11 more)

### Community 29 - "Inventory Data Models (C#)"
Cohesion: 0.10
Nodes (25): dynamic, List, AvailableUpdateItem, BiosInfo, CpuInfo, DnsQueryItem, DriverItem, GpuInfo (+17 more)

### Community 30 - "Project Docs & Agent Skills"
Cohesion: 0.09
Nodes (31): netdesk-diagnostician Agent, netdesk-researcher Agent, verify-changes Skill, activity_log Audit Trail, Agent Static API Key Auth Model, app_settings Feature Flag Registry, Backend Layered Architecture (routes-controllers-services-repositories), Self-Rescheduling Background Processes (+23 more)

### Community 31 - "Inventory Controller"
Cohesion: 0.15
Nodes (26): createInventoryItemController(), deleteInventoryItemController(), exportInventoryController(), getInventoryItemController(), labelForSite(), listInventoryController(), SITE_LABELS, siteFilter() (+18 more)

### Community 32 - "C# Primitive Type References"
Cohesion: 0.09
Nodes (21): bool, byte, ConcurrentDictionary, DateTime, IDisposable, long, int, IntPtr (+13 more)

### Community 33 - "DNS Logs View"
Cohesion: 0.08
Nodes (31): DnsLogsView(), addToBlacklist(), blacklist, blacklistDomain(), blacklistLimit, blacklistPage, blacklistSearch, blacklistSearchInput (+23 more)

### Community 34 - "Home View"
Cohesion: 0.06
Nodes (27): HomeView(), activeFilterCount, { confirmState, askConfirm, resolveConfirm }, counts, currentPageDisplay, deleteEntry(), departmentOptions, duplicateTotalGroups (+19 more)

### Community 35 - "Win32 Interop Types (C#)"
Cohesion: 0.11
Nodes (17): ProcessResult, DllImport, IEnumerable, int, IntPtr, JObject, string, TimeSpan (+9 more)

### Community 36 - "Agent Releases Repository"
Cohesion: 0.14
Nodes (29): downloadUpdateController(), findRecentForceReinstallJob(), deleteRelease(), fetchGroupsByReleaseIds(), findReleaseById(), findReleaseFiles(), findReleaseGroups(), findReleaseIdByVersion() (+21 more)

### Community 37 - "Server Health View"
Cohesion: 0.07
Nodes (28): ServerHealthView(), { confirmState, askConfirm, resolveConfirm }, cpuPoints, dbSizePoints, fmtHistTime(), ghostAudit, ghostAuditLoading, ghostCleaning (+20 more)

### Community 38 - "Manager Worker Install Flow (C#)"
Cohesion: 0.16
Nodes (9): AutoResetEvent, InstallResult, JObject, object, Task, TimeSpan, InstallResult, ManagerWorker (+1 more)

### Community 39 - "Inventory View"
Cohesion: 0.09
Nodes (22): INVENTORY_TYPE_OPTIONS, labelForInventoryType(), InventoryView(), activeFilterCount, confirmDelete(), { confirmState, askConfirm, resolveConfirm }, currentPageDisplay, entries (+14 more)

### Community 40 - "Batch Job Detail View"
Cohesion: 0.09
Nodes (21): BatchJobDetailView(), batch, cancelBatch(), cancellableCount, cancelling, cancellingItemId, cancelSingleJob(), { confirmState, askConfirm, resolveConfirm } (+13 more)

### Community 41 - "Agent Monitoring History Repo"
Cohesion: 0.16
Nodes (22): countFailedJobsSince(), listFailedJobsSince(), insertMonitoringSnapshot(), listCurrentMonitoringForAllAgents(), listMonitoringHistorySince(), countAgentsByConnectivity(), countAgentsEnrolledSince(), listAgentsEnrolledSince() (+14 more)

### Community 42 - "Manager API Client Models (C#)"
Cohesion: 0.11
Nodes (16): EnrollResponse, ManagerJobItem, ManagerJobResultRequest, ManagerJobsResponse, HttpClient, JObject, JsonSerializerSettings, List (+8 more)

### Community 43 - "DNS Logs Controller/DTO"
Cohesion: 0.18
Nodes (18): createFlaggedDomainController(), deleteFlaggedDomainController(), listDnsQueriesController(), listFlaggedDomainsController(), siteFilter(), FlagDomainSchema, deleteFlaggedDomain(), findFlaggedDomainMatch() (+10 more)

### Community 44 - "Manager Jobs Controller/Repo"
Cohesion: 0.21
Nodes (20): cancelManagerJobController(), createManagerJobController(), listManagerJobsController(), pollManagerJobsController(), submitManagerJobResultController(), cancelJob(), completeJob(), findJobById() (+12 more)

### Community 45 - "VNC Session View"
Cohesion: 0.12
Nodes (20): VncSessionView(), agent, applyManualScale(), buildWsUrl(), cleanup(), connected, handleFullscreenChange(), handleWindowResize() (+12 more)

### Community 46 - "Push Subscriptions (VAPID)"
Cohesion: 0.16
Nodes (16): VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT, pushPublicKeyController(), subscribePushController(), unsubscribePushController(), SubscribePushSchema, UnsubscribePushSchema (+8 more)

### Community 47 - "Agent Releases Controller"
Cohesion: 0.16
Nodes (18): createReleaseController(), deleteReleaseController(), downloadUpdateForManagerController(), listReleaseFilesController(), listReleasesController(), setReleaseActiveController(), updateReleaseGroupsController(), uploadMiddleware (+10 more)

### Community 48 - "Manager API Client (C#)"
Cohesion: 0.10
Nodes (10): NetdeskAgent.Manager, ManagerConfig, int, string, ManagerServiceInfo, ManagerState, string, ManagerVersionInfo (+2 more)

### Community 49 - "Export Utilities (PDF/XLSX)"
Cohesion: 0.21
Nodes (22): exportActivePrintersPdf(), downloadFromResponse(), fetchWithAuth(), exportPdf(), exportToXlsx(), exportToXlsx(), exportPdf(), exportPdf() (+14 more)

### Community 50 - "SSL Config & IP Status History"
Cohesion: 0.16
Nodes (15): HOST, PORT, SSL_CERT, SSL_KEY, CIPHERS, getSslOptions(), insertStatusHistoryBulk(), connectMySql() (+7 more)

### Community 51 - "PDSU Updates View"
Cohesion: 0.12
Nodes (19): ageBadgeClass(), ageLabel(), cryptoSafeKey(), daysSince(), { formatNumber, formatDate, barWidth }, freshness, freshnessBuckets, freshnessClass() (+11 more)

### Community 52 - "Service FileLogger (C#)"
Cohesion: 0.14
Nodes (9): Installer, Exception, object, string, FileLogger, Program, IDictionary, string (+1 more)

### Community 53 - "Notifications Controller/Repo"
Cohesion: 0.24
Nodes (17): listNotificationsController(), siteFilter(), CONNECTIVITY_STATUS_SQL, FLAGGED_DOMAIN_MATCH_SQL, countAgentOfflineButIpOnline(), countAntivirusInactiveAgents(), countAutomaticStoppedServices(), countBlacklistedDomainHits() (+9 more)

### Community 54 - "Manager FileLogger (C#)"
Cohesion: 0.17
Nodes (7): Exception, object, string, FileLogger, IDictionary, string, ProjectInstaller

### Community 55 - "Backend NPM Dependencies"
Cohesion: 0.11
Nodes (19): adm-zip, dependencies, adm-zip, cors, dotenv, express-rate-limit, jsonwebtoken, morgan (+11 more)

### Community 56 - "CORS & Env Config"
Cohesion: 0.20
Nodes (13): setupCors(), CORS_ALLOWED_ORIGINS, DB_CONNECTION_LIMIT, DB_HOST, DB_NAME, DB_PASS, DB_PORT, DB_USER (+5 more)

### Community 57 - "Daily Reports Controller/Repo"
Cohesion: 0.21
Nodes (16): getLatestReportController(), getReportByIdController(), getReportPdfController(), listReportsController(), markReportReadController(), siteFilter(), findDailyReportById(), findLatestDailyReport() (+8 more)

### Community 58 - "Deployment Groups Controller"
Cohesion: 0.21
Nodes (15): createDeploymentGroupController(), deleteDeploymentGroupController(), listDeploymentGroupsController(), listDeploymentGroupsUsageController(), AgentDeploymentGroupSchema, BatchAgentDeploymentGroupSchema, CreateDeploymentGroupSchema, deleteDeploymentGroupByName() (+7 more)

### Community 59 - "PDSU Overview View"
Cohesion: 0.11
Nodes (15): alertItems, coverageItems, driverStats, emit, { formatNumber, formatDate: formatDateBase }, managerAgentRows, printerStats, props (+7 more)

### Community 60 - "PDSU Printers View"
Cohesion: 0.11
Nodes (15): activePerComputer, computersWithMostPrinters, exportingActivePrintersPdf, { formatNumber, formatDate: formatDateBase, splitValues }, groupedByManufacturer, problemStatus, props, rarePrinters (+7 more)

### Community 61 - "Reports View"
Cohesion: 0.13
Nodes (18): ReportsView(), blacklistedDomainHits, downloadingPdf, downloadPdf(), error, fmtDate(), history, levelClass (+10 more)

### Community 62 - "Free IP Addresses View"
Cohesion: 0.11
Nodes (17): fetchData(), filteredIps, freeIps, ipToNum(), loadError, loading, occupiedCount, page (+9 more)

### Community 63 - "Activity Log & Event Logs"
Cohesion: 0.20
Nodes (10): listActivityLogController(), ActivityLogQuerySchema, listActivityLog(), insertEventLogsBulk(), listEventLogs(), router, listActivityLogService(), ingestEventLogs() (+2 more)

### Community 64 - "VNC Sessions Controller/Repo"
Cohesion: 0.26
Nodes (14): endVncSessionController(), startVncSessionController(), findVncSessionById(), insertVncSession(), markVncSessionActive(), markVncSessionEnded(), endVncSessionService(), startVncSessionService() (+6 more)

### Community 65 - "Architecture Decision Notes"
Cohesion: 0.18
Nodes (16): COMMAND_TYPES, Deployment Group Targeting (test/it/pilot/rest), DNS Query Logging Evolution (ETW to Npcap to WinDivert), Netdesk Agent Manager (NetdeskAgentManager Service), Netdesk.Agent.Updater (legacy separate update process), VNC Remote Screen Control (vnc_enabled flag), WinDivert LGPLv3/GPLv2 Dual License, Service/Updater Folder Split for Auto-Update (+8 more)

### Community 66 - "Frontend Lint Dependencies"
Cohesion: 0.12
Nodes (17): eslint-plugin-vue, devDependencies, eslint, @eslint/js, eslint-plugin-vue, globals, prettier, vite-plugin-vue-devtools (+9 more)

### Community 67 - "Add IP Entry View"
Cohesion: 0.14
Nodes (14): ENTRY_TYPE_OPTIONS, labelForEntryType(), AddIpView(), currentSite, entryTypeModel, error, fetchGroupOptions(), form (+6 more)

### Community 68 - "Downloads Folder View"
Cohesion: 0.14
Nodes (14): DownloadsFolderView(), { confirmState, askConfirm, resolveConfirm }, copyLink(), fetchData(), fileInputRef, fmtDate(), items, loading (+6 more)

### Community 69 - "Inventory/Security Posture Collectors (C#)"
Cohesion: 0.16
Nodes (6): Func, List, InventoryCollector, string, SecurityPostureCollector, StoreName

### Community 70 - "Managers Controller/DTO"
Cohesion: 0.16
Nodes (12): enrollController(), heartbeatController(), CreateManagerJobSchema, MANAGER_COMMAND_TYPES, MANAGER_SERVICE_COMMANDS, ManagerEnrollSchema, ManagerHeartbeatSchema, ManagerJobCommandFields (+4 more)

### Community 71 - "Event Log Bookmarks (C#)"
Cohesion: 0.19
Nodes (8): Dictionary, EventRecord, EventLogBookmarks, int, List, string, EventLogCollector, EventLogItem

### Community 72 - "Batch Jobs View"
Cohesion: 0.13
Nodes (15): BatchJobsView(), fmtDate(), fmtDate(), fmtDate(), fmtDate(), fmtDate(), items, loading (+7 more)

### Community 73 - "IP Port Scan View"
Cohesion: 0.12
Nodes (14): IpPortScanView(), entry, entryError, entryLoading, loadEntry(), portScanError, portScanLoading, portScanPorts (+6 more)

### Community 74 - "App Settings Controller/DTO/Repo"
Cohesion: 0.27
Nodes (11): listSettingsController(), updateSettingController(), APP_SETTINGS, SETTING_KEYS, UpdateSettingSchema, getSettingValue(), listStoredSettings(), upsertSetting() (+3 more)

### Community 75 - "Backend Dev/Test Dependencies"
Cohesion: 0.13
Nodes (15): devDependencies, eslint, @eslint/js, eslint-plugin-import, globals, nodemon, supertest, vitest (+7 more)

### Community 76 - "Roadmap Ideas & Removed Prototypes"
Cohesion: 0.13
Nodes (15): License/Warranty Asset Tracking Roadmap Idea, Audit Log of Admin Actions Roadmap Idea, Configurable Alerting Roadmap Idea, Installer Package/GPO Distribution Roadmap Idea, Missing Real-Time Command Channel, Removed Custom Remote-Control Prototype (GDI capture + SendInput), VNC-Based Remote Control (UltraVNC + noVNC), Machine Grouping/Tagging Roadmap Idea (+7 more)

### Community 77 - "Frontend NPM Dependencies"
Cohesion: 0.13
Nodes (15): dependencies, dotenv, @novnc/novnc, tailwindcss, @tailwindcss/vite, vue, vue-router, xlsx (+7 more)

### Community 78 - "PDSU Flagged View"
Cohesion: 0.13
Nodes (14): driverFilter, emit, filteredDrivers, filteredServices, filteredSoftware, { isAdmin }, props, router (+6 more)

### Community 79 - "Edit IP Entry View"
Cohesion: 0.17
Nodes (13): createIpEntryForm(), EditIpView(), entryTypeModel, error, fetchEntry(), fetchGroupOptions(), fields, form (+5 more)

### Community 80 - "Computers For Repack View"
Cohesion: 0.15
Nodes (14): ComputersForRepackView(), clearSearch(), fetchData(), { getSignal, abort }, items, loading, onSearchInput(), { page, limit, search, nextPage, prevPage, applyServerPagination } (+6 more)

### Community 81 - "Downloads Folder Backend"
Cohesion: 0.30
Nodes (11): deleteDownloadsFolderController(), listDownloadsFolderController(), uploadDownloadsFolderController(), uploadMiddleware, router, deleteFromDownloadsFolderService(), DOWNLOADS_DIR, ensureDownloadsDir() (+3 more)

### Community 82 - "Repack Recommendations View"
Cohesion: 0.14
Nodes (12): RepackRecommendationsView(), cpuTierFilter, fetchData(), filteredItems, items, loadError, loading, markForRepack() (+4 more)

### Community 83 - "Manager Windows Service (C#)"
Cohesion: 0.15
Nodes (5): CancellationToken, CancellationTokenSource, Task, NetdeskAgentManagerService, Program

### Community 84 - "VNC Bridge (C#)"
Cohesion: 0.22
Nodes (8): NetdeskAgent.Common.Vnc, NetworkStream, CancellationToken, int, Task, VncBridge, TaskCompletionSource, WebSocket

### Community 85 - "PDSU Services View"
Cohesion: 0.15
Nodes (10): automaticStopped, { formatNumber, formatDate: formatDateBase, splitValues }, props, rareServices, runningPercent, stats, stoppedPercent, tables (+2 more)

### Community 86 - "PDSU Software View"
Cohesion: 0.15
Nodes (11): computersWithMostSoftware, { formatNumber, formatDate: formatDateBase, barWidth, splitValues }, maxPublisherInstallations, maxTopSoftwareComputers, multipleVersions, props, rareSoftware, stats (+3 more)

### Community 87 - "Abortable Fetch Composable"
Cohesion: 0.19
Nodes (12): useAbortableFetch(), abort(), getSignal(), applyServerPagination(), fetchData(), fetchData(), fetchData(), fetchMissingMetadata() (+4 more)

### Community 88 - "Current Site & Duplicate Names"
Cohesion: 0.18
Nodes (9): useCurrentSite(), DuplicateNamesView(), duplicateGroups, error, loadDuplicates(), loading, router, site (+1 more)

### Community 89 - "Computers Without Agent View"
Cohesion: 0.17
Nodes (12): ComputersWithoutAgentView(), clearSearch(), exportingPdf, { getSignal, abort }, items, loading, onSearchInput(), { page, limit, search, nextPage, prevPage, applyServerPagination } (+4 more)

### Community 90 - "Service Solution/Project Config"
Cohesion: 0.17
Nodes (12): WebSocketSharp-netstandard (1.0.1), Netdesk.Agent.Common, net452, Newtonsoft.Json (13.0.3), Microsoft.NET.Sdk, Netdesk.Agent.Manager, net452, Newtonsoft.Json (13.0.3) (+4 more)

### Community 91 - "Process Detections Backend"
Cohesion: 0.29
Nodes (8): listProcessDetectionsController(), siteFilter(), listProcessDetections(), upsertProcessDetectionsBulk(), router, ingestProcessDetections(), listProcessDetectionsService(), SORT_FIELDS

### Community 92 - "Frontend App Bootstrap"
Cohesion: 0.21
Nodes (8): app, AgentDetailView(), AgentsView(), FreeIpAddressesView(), MetadataView(), router, getRememberedSite(), rememberSite()

### Community 93 - "App Footer & Layout"
Cohesion: 0.23
Nodes (7): { year, copyright, version }, useAppInfo(), { copyright }, { currentUser }, userInitial, MainLayout(), NotFoundView()

### Community 94 - "PDSU Drivers View"
Cohesion: 0.17
Nodes (9): computersWithMostDrivers, { formatNumber, formatDate, barWidth, splitValues }, maxManufacturerDrivers, multipleVersions, oldestDrivers, props, stats, tables (+1 more)

### Community 95 - "Paginated Route Composable"
Cohesion: 0.29
Nodes (8): fieldsEqual(), parseField(), queryValue(), serializeField(), usePaginatedRoute(), buildQuery(), isQuerySynced(), setupWithRoute()

### Community 96 - "Process Detections View"
Cohesion: 0.18
Nodes (11): ProcessDetectionsView(), clearSearch(), { getSignal, abort }, items, loading, onSearchInput(), { page, limit, search, sortBy, sortOrder, nextPage, prevPage, applyServerPagination }, searchInput (+3 more)

### Community 97 - "Software Inventory Collector (C#)"
Cohesion: 0.27
Nodes (6): RegistryKey, RegistryView, SoftwareItem, List, string, SoftwareCollector

### Community 98 - "Change Password Component"
Cohesion: 0.20
Nodes (8): close(), confirmPassword, currentPassword, newPassword, open, save(), saving, { toast, showToast }

### Community 99 - "Agent Jobs DTO"
Cohesion: 0.29
Nodes (7): BatchCreateJobSchema, COMMAND_TYPES, CreateJobSchema, JobCommandFields, JobListQuerySchema, JobResultSchema, SERVICE_COMMANDS

### Community 100 - "Theme Init & Dark Mode"
Cohesion: 0.20
Nodes (6): Pre-Paint Theme Init Script, frontend index.html, media, theme, main.js, theme-init.js

### Community 101 - "MultiSelect Component"
Cohesion: 0.22
Nodes (8): emit, filteredOptions, filterText, open, props, rootEl, summaryLabel, toggle()

### Community 102 - "Site Switcher"
Cohesion: 0.29
Nodes (7): currentSite, label, route, router, isValidSite(), labelForSite(), SITE_VALUES

### Community 103 - "Theme Toggle Component"
Cohesion: 0.22
Nodes (7): cycle(), icons, order, { theme, setTheme }, titles, useTheme(), setTheme()

### Community 104 - "Config View"
Cohesion: 0.24
Nodes (9): ConfigView(), error, fetchData(), fmtDate(), loading, saving, settings, { toast, showToast } (+1 more)

### Community 105 - "Logs View"
Cohesion: 0.20
Nodes (8): LogsView(), action, entries, loading, { page, limit, nextPage, prevPage, applyServerPagination }, total, totalPages, username

### Community 106 - "Agent Detail Job Actions"
Cohesion: 0.22
Nodes (10): cancelJob(), confirmClearJobs(), createJob(), loadDnsLogs(), loadEventLogs(), loadJobs(), loadUpdateLog(), selectTab() (+2 more)

### Community 107 - "Backend Package Metadata"
Cohesion: 0.22
Nodes (8): author, description, keywords, license, main, name, type, version

### Community 108 - "Domain Blacklist Sync Service"
Cohesion: 0.36
Nodes (7): bulkInsertFlaggedDomains(), FETCHED_SOURCES, fetchText(), parseHostsFileDomains(), parseUrlhausCsvDomains(), STREAMING_DOMAINS, syncDomainBlacklists()

### Community 109 - "Agent Update & Signing Docs"
Cohesion: 0.25
Nodes (9): bump-agent-version Skill, Agent Auto-Update Flow, Agent Release Package Signing (RSA-SHA256, Internal CA), Manual Agent Version Bump Requirement, Daily Report Trend/Anomaly Detection, NetDesk RMM System, PWA Push Notifications (VAPID/web-push), NetDesk README (+1 more)

### Community 110 - "Frontend NPM Scripts"
Cohesion: 0.22
Nodes (9): scripts, build, dev, format, lint, lint:fix, preview, test (+1 more)

### Community 111 - "Group Select Component"
Cohesion: 0.25
Nodes (7): addGroup(), adding, allOptions, emit, newGroupName, props, showAddForm

### Community 112 - "Push Notification Toggle"
Cohesion: 0.33
Nodes (6): { isSupported, isSubscribed, loading, error, checkSubscription, subscribe, unsubscribe }, toggle(), urlBase64ToUint8Array(), usePushNotifications(), subscribe(), unsubscribe()

### Community 113 - "Login View"
Cohesion: 0.22
Nodes (7): LoginView(), errorMessage, password, route, router, username, { year, copyright }

### Community 114 - "PDSU Service Label Helpers"
Cohesion: 0.47
Nodes (7): normalizeStartMode(), normalizeState(), startModeBadgeClass(), startModeLabel(), stateBadgeClass(), stateLabel(), cellValue()

### Community 116 - "Manager DirectorySync (C#)"
Cohesion: 0.31
Nodes (4): Exception, int, TimeSpan, DirectorySync

### Community 117 - "ESLint Ignore Patterns"
Cohesion: 0.25
Nodes (7): ignorePatterns, dist/, node_modules/, build/, coverage/, .git/, *.min.js

### Community 118 - "Deployment Group Picker"
Cohesion: 0.36
Nodes (7): addCustom(), allOptions, customInput, emit, isChecked(), props, toggle()

### Community 119 - "IP Entry Fields Constants"
Cohesion: 0.25
Nodes (7): IP_ENTRY_DEFAULTS, IP_ENTRY_FIELDS, IP_OPTIONAL_FIELDS, IPV4_REGEX, validateIpv4(), ipError, ipError

### Community 120 - "Agent Detail Manager Actions"
Cohesion: 0.32
Nodes (8): installViaManager(), loadManagerJobHistory(), loadManagerStatus(), reportManagerJobOutcome(), sendManagerServiceAction(), setManagerStartMode(), sleep(), waitForManagerJobResult()

### Community 121 - "Agent DirectorySync (C#)"
Cohesion: 0.32
Nodes (4): Exception, int, TimeSpan, DirectorySync

### Community 122 - "Manager Update Report Client (C#)"
Cohesion: 0.25
Nodes (4): ManagerCommand, Task, UpdateReportClient, UpdateReportRequest

### Community 123 - "Update Check & Semver"
Cohesion: 0.48
Nodes (5): checkUpdateController(), findActiveReleasesForGroups(), checkForUpdateService(), compareVersions(), isNewerVersion()

### Community 124 - "Backend NPM Scripts"
Cohesion: 0.29
Nodes (7): scripts, dev, lint, migrate, start, test, test:watch

### Community 125 - "Trend Analysis Utility"
Cohesion: 0.48
Nodes (4): computeDiskFillProjection(), computeThresholdProjection(), linearRegressionSlope(), sortedPoints()

### Community 126 - "Frontend Auth Utilities"
Cohesion: 0.52
Nodes (3): decodeJwt(), isTokenExpired(), safeRedirectToLogin()

### Community 127 - "Agent Signing Cert Utility"
Cohesion: 0.47
Nodes (5): AGENT_SIGNING_CERT_PATH, AGENT_SIGNING_KEY_PATH, getSigningCertificatePem(), load(), signBuffer()

### Community 128 - "JS Config Path Aliases"
Cohesion: 0.33
Nodes (5): compilerOptions, paths, exclude, dist, node_modules

### Community 129 - "App Nav Component"
Cohesion: 0.33
Nodes (4): baseLinks, { isOperatorOrAdmin, isRootAdmin }, links, route

### Community 130 - "Logout Button Component"
Cohesion: 0.40
Nodes (3): logout(), router, resetCurrentUser()

### Community 131 - "Notification Ticker Component"
Cohesion: 0.33
Nodes (5): levelClass, levelIcon, load(), loopItems, notifications

### Community 132 - "Select Site View"
Cohesion: 0.33
Nodes (4): SITE_OPTIONS, SelectSiteView(), route, router

### Community 133 - "Job Models (C#)"
Cohesion: 0.40
Nodes (5): JObject, List, JobItem, JobResultRequest, JobsResponse

### Community 134 - "Heartbeat Models (C#)"
Cohesion: 0.47
Nodes (5): HeartbeatAgentInfo, HeartbeatRequest, HeartbeatResponse, MonitoringData, PingResponse

### Community 135 - "Agent Windows Service (C#)"
Cohesion: 0.33
Nodes (4): CancellationTokenSource, Task, NetdeskAgentService, ServiceBase

### Community 136 - "Frontend Package Metadata"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 137 - "Prettier Config"
Cohesion: 0.40
Nodes (4): printWidth, $schema, semi, singleQuote

### Community 139 - "DB Migration Workflow Docs"
Cohesion: 0.67
Nodes (4): db-migration Skill, DB Migration Workflow, No Baseline Schema File Limitation, schema_migrations table

### Community 140 - "Agent Version Constant (C#)"
Cohesion: 0.50
Nodes (3): NetdeskAgent.Common, string, AgentVersionInfo

### Community 141 - "Current User Composable"
Cohesion: 0.67
Nodes (3): currentUser, load(), useCurrentUser()

### Community 143 - "Agent Command Constants"
Cohesion: 0.50
Nodes (3): COMMAND_LABELS, COMMAND_TYPES, SERVICE_COMMANDS

### Community 144 - "Agents View Filter Helpers"
Cohesion: 0.50
Nodes (4): buildFilterParams(), confirmRevoke(), fetchData(), selectAllMatching()

### Community 145 - "PDSU Analytics Fetch Helpers"
Cohesion: 0.50
Nodes (4): fetchMissingPdsu(), fetchWithoutNetdeskAgentManager(), fetchWithoutUltravnc(), loadStats()

## Ambiguous Edges - Review These
- `Netdesk.Agent.Updater (legacy separate update process)` → `Netdesk Agent Manager (NetdeskAgentManager Service)`  [AMBIGUOUS]
  service/README.md · relation: conceptually_related_to
- `RBAC Roles (admin/operator/viewer)` → `RBAC/Permissions Roadmap Idea`  [AMBIGUOUS]
  docs/agent-roadmap.md · relation: conceptually_related_to

## Knowledge Gaps
- **820 isolated node(s):** `node_modules/`, `dist/`, `build/`, `coverage/`, `.git/` (+815 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Netdesk.Agent.Updater (legacy separate update process)` and `Netdesk Agent Manager (NetdeskAgentManager Service)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `RBAC Roles (admin/operator/viewer)` and `RBAC/Permissions Roadmap Idea`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `NetDesk TECHNICAL.md` connect `Project Docs & Agent Skills` to `Architecture Decision Notes`, `Theme Init & Dark Mode`, `App Settings Controller/DTO/Repo`, `DB Migration Workflow Docs`, `Roadmap Ideas & Removed Prototypes`, `Agent Update & Signing Docs`, `Push Notification Toggle`, `VNC Bridge (C#)`, `CORS & Env Config`, `Trend Analysis Utility`?**
  _High betweenness centrality (0.337) - this node is a cross-community bridge._
- **Why does `fetchWithAuth()` connect `Export Utilities (PDF/XLSX)` to `Notification Ticker Component`, `Agent Detail View`, `Math/Chart Utilities`, `Agent Releases View`, `Shared UI Components (VNC/Dialogs)`, `Current User Composable`, `PDSU Uptime Timeline`, `Agents List View`, `Agents View Filter Helpers`, `PDSU Analytics Fetch Helpers`, `Printers View`, `IP PDSU View`, `PDSU Analytics View`, `DNS Logs View`, `Home View`, `Server Health View`, `Inventory View`, `Batch Job Detail View`, `VNC Session View`, `PDSU Printers View`, `Reports View`, `Free IP Addresses View`, `Add IP Entry View`, `Downloads Folder View`, `Batch Jobs View`, `IP Port Scan View`, `PDSU Flagged View`, `Edit IP Entry View`, `Computers For Repack View`, `Repack Recommendations View`, `Abortable Fetch Composable`, `Current Site & Duplicate Names`, `Computers Without Agent View`, `Process Detections View`, `Change Password Component`, `Config View`, `Logs View`, `Agent Detail Job Actions`, `Group Select Component`, `Push Notification Toggle`, `Agent Detail Manager Actions`, `Frontend Auth Utilities`?**
  _High betweenness centrality (0.196) - this node is a cross-community bridge._
- **Why does `Netdesk Agent README` connect `Architecture Decision Notes` to `Agent Common Namespaces (C#)`, `Roadmap Ideas & Removed Prototypes`, `Agent Update & Signing Docs`, `VNC Bridge (C#)`, `Project Docs & Agent Skills`, `Agent Signing Cert Utility`?**
  _High betweenness centrality (0.174) - this node is a cross-community bridge._
- **What connects `node_modules/`, `dist/`, `build/` to the rest of the system?**
  _820 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `IP Metadata Controllers` be split into smaller, more focused modules?**
  _Cohesion score 0.060527825588066554 - nodes in this community are weakly interconnected._