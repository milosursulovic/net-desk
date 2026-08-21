# Graph Report - net-desk  (2026-08-21)

## Corpus Check
- 411 files · ~245,138 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3004 nodes · 7495 edges · 161 communities (134 shown, 27 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 323 edges (avg confidence: 0.85)
- Token cost: 279,031 input · 0 output

## Community Hubs (Navigation)
- PDSU PDF/XLSX Export & Reports
- Deployment Groups & Downloads CRUD
- IP Address CRUD & Search
- Auth, Users & Activity Log
- Agent Releases & Update Targeting
- Backend Integration Test Helpers
- Flagged Exceptions (Drivers/Services/Software)
- Agent Repository Queries
- Agent Detail View Helpers
- Metadata View Hardware Distributions
- Docs, Skills & Feature Flags
- Flagged Software/Driver/Service CRUD
- Frontend Views & Auth Utils
- Agent Enrollment & Job Results
- Printers CRUD
- Agents List Filters (Frontend)
- Server Health Monitoring
- Computer Metadata Repository
- C# Agent Common Collectors
- DNS Logs & Test Cleanup Helpers
- Printers View (Frontend)
- Agent Jobs & Batch Commands
- Agent Core State & Worker (C#)
- PDSU View (IP Detail, Frontend)
- PDSU Analytics View (Frontend)
- Daily Reports & Agent Monitoring
- DNS Query Capture (WinDivert, C#)
- Groups View & PDSU Flagged UI
- VNC Bridge & Agent Roadmap Docs
- DNS Logs View (Frontend)
- Job Executor & Process Runner (C#)
- Home View (IP List, Frontend)
- Hardware Collector (C#)
- Agent HTTP Models (C#)
- Agent Releases View (Frontend)
- Inventory Collector Models (C#)
- Inventory CRUD
- PDSU Controller & Routes
- Server Health View (Frontend)
- Date/Log Formatting Helpers
- Inventory View (Frontend)
- PDSU Updates Formatting
- Batch Job Detail View (Frontend)
- Repack Groups & Group Select
- IP Metadata View (Frontend)
- Service & Windows Update Collectors (C#)
- Agent Service Installers (C#)
- Agent Manager File Sync (C#)
- Flagged Domains & DNS Query List
- Metadata PDF Export & Search
- PDSU Service Label Formatting
- Confirm Dialogs & Deployment Group UI
- Add/Edit IP View (Frontend)
- Backend Runtime Dependencies
- Push Subscriptions
- PDSU Overview Panel (Frontend)
- Reports View (Frontend)
- VNC Session View (Frontend)
- Paginated Route Composable
- Free IP Addresses View
- Notifications Aggregation Queries
- Backend Dev Dependencies
- Agent Auth Test Helpers
- PDSU Printers Panel (Frontend)
- Math/Stat Helpers & Metadata
- Env Config & Migrations
- Server Startup & Scheduled Jobs
- VNC Session Backend (Service/Relay)
- IP Entry Metadata Endpoints
- Event Log Collector (C#)
- Frontend Dev Dependencies
- PDF/XLSX Export Frontend Helpers
- Users View & Slide-Over Panel
- Add IP View & Entry Types
- Downloads Folder View
- Manager Command Client & Update Manager (C#)
- Site Switcher & Selection
- App Settings & Feature Flags
- Frontend Runtime Dependencies
- App Layout & Footer Components
- Repack Recommendations View
- Pagination & List Controllers
- Toast & Change Password UI
- PDSU Software Panel (Frontend)
- Abortable Fetch Composable
- Duplicate Names View
- Number/Date Formatting Utils
- Computers Without Agent View
- Process Detections View
- PDSU Drivers Panel (Frontend)
- Agent Solution Structure (net452)
- Windows Service Lifecycle (C#)
- Process Detections Backend
- Domain Blacklist Sync
- Trend Analysis & Anomaly Detection
- Deployment Groups View (Frontend)
- VNC Bridge WebSocket Relay (C#)
- Software Collector (C#)
- Agent Job DTOs
- Theme Init & Tests
- MultiSelect Component
- Theme Toggle Composable
- Config View & Toast Component
- Daily Report Services
- PDSU Repository Queries
- IP Address DTOs
- Backend Package Metadata
- Frontend Package Scripts
- VNC Viewer & Shared UI Components
- Push Notifications Composable
- Login View
- LocalStorage Test Mock
- HTTP Error & ID Param Utils
- Backend ESLint Ignore Patterns
- Deployment Group Picker Component
- Agent Detail Job Tabs
- PDSU Flagging Actions (Frontend)
- Agents View Batch Actions
- File Logger (C#)
- Backend NPM Scripts
- Event Logs Service
- Frontend jsconfig Paths
- App Navigation Component
- Notification Ticker Component
- Frontend Package Identity
- Prettier Config
- PDSU Stats Fetch Helpers
- Agent Version Constant (C#)
- Confirm Dialog Composable
- Agent Command Constants
- Agent API Exception (C#)
- Agent Paths Config (C#)
- Agent Manager Entry Point (C#)
- CORS Dependency
- DejaVu Fonts Dependency
- Dotenv Dependency
- Rate Limiting Dependency
- Helmet Dependency
- JWT Dependency
- Morgan Logging Dependency
- PDFKit Dependency
- Ping Dependency
- WS Dependency
- ESLint Dependency (Frontend)
- Vue DevTools Plugin
- Vite Vue Plugin
- Vue ESLint Prettier Config
- Vue Test Utils
- PWA Icon Design (192px)
- PowerShell Presets Constant
- Agents View Search Handlers
- PWA Icon Design (512px)
- NetDesk Branding Icon
- Vue Scaffold Logo (Unused)

## God Nodes (most connected - your core abstractions)
1. `fetchWithAuth()` - 185 edges
2. `badRequest()` - 106 edges
3. `parseError()` - 94 edges
4. `parseIdParam()` - 82 edges
5. `notFound()` - 73 edges
6. `pool` - 50 edges
7. `NetDesk TECHNICAL.md` - 44 edges
8. `pdsuAnalyticsStatsService()` - 35 edges
9. `NetdeskApiClient` - 32 edges
10. `generateDailyReport()` - 30 edges

## Surprising Connections (you probably didn't know these)
- `NetDesk TECHNICAL.md` --references--> `isFeatureEnabled()`  [EXTRACTED]
  docs/TECHNICAL.md → backend/services/appSettings.service.js
- `Netdesk.Agent.Updater (legacy separate update process)` --conceptually_related_to--> `Netdesk Agent Manager (NetdeskAgentManager Service)`  [AMBIGUOUS]
  CLAUDE.md → service/README.md
- `netdesk-researcher Agent` --references--> `computer_metadata table`  [EXTRACTED]
  .claude/agents/netdesk-researcher.md → docs/TECHNICAL.md
- `NetDesk README` --references--> `Agent Roadmap`  [EXTRACTED]
  README.md → docs/agent-roadmap.md
- `NetDesk README` --references--> `Netdesk Agent README`  [EXTRACTED]
  README.md → service/README.md

## Import Cycles
- 3-file cycle: `frontend/src/composables/useCurrentUser.js -> frontend/src/utils/fetchWithAuth.js -> frontend/src/router/index.js -> frontend/src/composables/useCurrentUser.js`

## Hyperedges (group relationships)
- **Agent Auto-Update Workflow** — claude_skills_bump_agent_version_skill_doc, service_netdesk_agent_common_agentversioninfo_current, concept_agent_auto_update_flow, service_netdesk_agent_common_update_updatemanager, backend_services_agentreleases_service [EXTRACTED 1.00]
- **DNS Query Logging Pipeline** — concept_dns_query_logging_evolution, service_netdesk_agent_common_dnslogs_dnsquerycollector, service_netdesk_agent_common_dnslogs_windivertinterop, concept_windivert_dual_license, db_computer_dns_queries [EXTRACTED 1.00]
- **Netdesk Agent Manager Update Mechanism** — concept_netdesk_agent_manager, service_netdesk_agent_common_update_updatemanager, concept_agent_auto_update_flow, frontend_src_constants_powershellpresets [INFERRED 0.85]

## Communities (161 total, 27 thin omitted)

### Community 0 - "PDSU PDF/XLSX Export & Reports"
Cohesion: 0.06
Nodes (79): exportActivePrintersPdfController(), exportPdsuAnalyticsController(), exportWithoutNetdeskAgentManagerPdfController(), exportWithoutPdsuPdfController(), exportWithoutUltravncPdfController(), listWithoutNetdeskAgentManagerController(), listWithoutPdsuController(), listWithoutUltravncController() (+71 more)

### Community 1 - "Deployment Groups & Downloads CRUD"
Cohesion: 0.06
Nodes (60): createDeploymentGroupController(), deleteDeploymentGroupController(), listDeploymentGroupsController(), listDeploymentGroupsUsageController(), deleteDownloadsFolderController(), listDownloadsFolderController(), uploadDownloadsFolderController(), uploadMiddleware (+52 more)

### Community 2 - "IP Address CRUD & Search"
Cohesion: 0.07
Nodes (59): createController(), deleteController(), duplicatesController(), exportXlsxController(), filterOptionsController(), freeIpAddressesController(), getByIdController(), listController() (+51 more)

### Community 3 - "Auth, Users & Activity Log"
Cohesion: 0.07
Nodes (47): JWT_EXPIRES_IN, listActivityLogController(), changePasswordController(), loginController(), meController(), createUserController(), deleteUserController(), listUsersController() (+39 more)

### Community 4 - "Agent Releases & Update Targeting"
Cohesion: 0.08
Nodes (48): AGENT_SIGNING_CERT_PATH, AGENT_SIGNING_KEY_PATH, checkUpdateController(), createReleaseController(), listReleaseFilesController(), reportUpdateController(), setReleaseActiveController(), updateReleaseGroupsController() (+40 more)

### Community 5 - "Backend Integration Test Helpers"
Cohesion: 0.09
Nodes (34): createApp(), __dirname, FRONTEND_DIST, setupCors(), CORS_ALLOWED_ORIGINS, IS_PROD, JWT_SECRET, setupLogger() (+26 more)

### Community 6 - "Flagged Exceptions (Drivers/Services/Software)"
Cohesion: 0.09
Nodes (46): addFlaggedDriverException(), addFlaggedServiceException(), addFlaggedSoftwareException(), listFlaggedDriverExceptionsForIpEntry(), listFlaggedServiceExceptionsForIpEntry(), listFlaggedSoftwareExceptionsForIpEntry(), removeFlaggedDriverException(), removeFlaggedServiceException() (+38 more)

### Community 7 - "Agent Repository Queries"
Cohesion: 0.11
Nodes (45): listDistinctReleaseDeploymentGroups(), buildAgentsWhereClause(), deleteAgentById(), findAgentById(), findAgentIpEntry(), findAgentMonitoring(), findAgentWindowsUpdateStatus(), linkAgentToIpEntry() (+37 more)

### Community 8 - "Agent Detail View Helpers"
Cohesion: 0.04
Nodes (41): activeReleaseOptions, agent, cancellingJobId, { confirmState, askConfirm, resolveConfirm }, connectivityBadgeClass, connectivityLabel, creatingJob, deploymentGroupOptions (+33 more)

### Community 9 - "Metadata View Hardware Distributions"
Cohesion: 0.05
Nodes (45): groupCount(), joinNonEmpty(), biosDist, cpuDist, DataTable, diskBuckets, displayTables, exportingMissingPdf (+37 more)

### Community 10 - "Docs, Skills & Feature Flags"
Cohesion: 0.07
Nodes (44): netdesk-diagnostician Agent, netdesk-researcher Agent, bump-agent-version Skill, db-migration Skill, verify-changes Skill, activity_log Audit Trail, Agent Static API Key Auth Model, Agent Auto-Update Flow (+36 more)

### Community 11 - "Flagged Software/Driver/Service CRUD"
Cohesion: 0.09
Nodes (42): createFlaggedDriverController(), createFlaggedServiceController(), createFlaggedSoftwareController(), deleteFlaggedDriverController(), deleteFlaggedServiceController(), deleteFlaggedSoftwareController(), listAgentsForFlaggedDriverController(), listAgentsForFlaggedServiceController() (+34 more)

### Community 12 - "Frontend Views & Auth Utils"
Cohesion: 0.06
Nodes (32): logout(), router, resetCurrentUser(), app, AgentDetailView(), AgentReleasesView(), AgentsView(), HomeView() (+24 more)

### Community 13 - "Agent Enrollment & Job Results"
Cohesion: 0.10
Nodes (37): submitJobResultController(), downloadUpdateController(), addAgentDeploymentGroupController(), addAgentsDeploymentGroupController(), agentFilterOptionsController(), CONNECTIVITY_FILTERS, dateFilter(), deleteAgentController() (+29 more)

### Community 14 - "Printers CRUD"
Cohesion: 0.13
Nodes (38): connectController(), createPrinterController(), deletePrinterController(), disconnectController(), exportXlsxPrintersController(), getPrinterController(), listPrintersController(), setHostController() (+30 more)

### Community 15 - "Agents List Filters (Frontend)"
Cohesion: 0.05
Nodes (32): activeDetailedFilterCount, allVisibleSelected, assigningDeploymentGroup, batchForm, batchOnlyOnline, batchSelectedPresetId, { confirmState, askConfirm, resolveConfirm }, CONNECTIVITY_LABELS (+24 more)

### Community 16 - "Server Health Monitoring"
Cohesion: 0.10
Nodes (32): auditGhostReferencesController(), cleanGhostReferencesController(), getLiveServerHealthController(), timed(), requestMetricsMiddleware(), auditGhostReferences(), cleanGhostReferences(), orphanWhere() (+24 more)

### Community 17 - "Computer Metadata Repository"
Cohesion: 0.13
Nodes (38): countMetadataTotal(), deleteMetadataForIpEntry(), findMetadataIdByIpEntryId(), listEntriesWithoutMetadata(), listMetadataIds(), loadMetadataBaseById(), loadMetadataChildren(), searchMetadataRows() (+30 more)

### Community 18 - "C# Agent Common Collectors"
Cohesion: 0.10
Nodes (16): NetdeskAgent.Common.Inventory, NetdeskAgent.Common.Models, NetdeskAgent.Common.Update, NetdeskAgent.Common.Monitoring, NetdeskAgent.Common.ProcessMonitor, NetdeskAgent.Common.EventLogs, NetdeskAgent.Manager, NetdeskAgent.Common.Manager (+8 more)

### Community 19 - "DNS Logs & Test Cleanup Helpers"
Cohesion: 0.12
Nodes (18): AGENT_ENROLL_TOKEN, pool, ingestDnsQueries(), createService(), deleteTestAgent(), deleteTestDailyReport(), deleteTestIpEntry(), deleteTestPushSubscription() (+10 more)

### Community 20 - "Printers View (Frontend)"
Cohesion: 0.07
Nodes (33): clearSearch(), confirmDelete(), { confirmState, askConfirm, resolveConfirm }, connectComputerFromTools(), disconnectComputerFromTools(), editId, fetchData(), form (+25 more)

### Community 21 - "Agent Jobs & Batch Commands"
Cohesion: 0.14
Nodes (34): cancelBatchController(), cancelJobController(), clearJobsController(), createBatchJobController(), createJobController(), getBatchStatusController(), listJobBatchesController(), listJobsController() (+26 more)

### Community 22 - "Agent Core State & Worker (C#)"
Cohesion: 0.17
Nodes (13): ExecutionResult, HttpClient, JsonSerializerSettings, List, AgentSettings, AgentState, NetdeskApiClient, CancellationToken (+5 more)

### Community 23 - "PDSU View (IP Detail, Frontend)"
Cohesion: 0.06
Nodes (34): addException(), { confirmState, askConfirm, resolveConfirm }, drivers, entry, entryError, entryLoading, exceptions, exceptionsOpen (+26 more)

### Community 24 - "PDSU Analytics View (Frontend)"
Cohesion: 0.06
Nodes (31): activeTab, coverage, drivers, exporting, exportingMissingPdf, exportingWithoutNetdeskAgentManagerPdf, exportingWithoutUltravncPdf, flaggedDrivers (+23 more)

### Community 25 - "Daily Reports & Agent Monitoring"
Cohesion: 0.13
Nodes (29): markReportReadController(), countFailedJobsSince(), listFailedJobsSince(), insertMonitoringSnapshot(), listCurrentMonitoringForAllAgents(), listMonitoringHistorySince(), countAgentsByConnectivity(), countAgentsEnrolledSince() (+21 more)

### Community 26 - "DNS Query Capture (WinDivert, C#)"
Cohesion: 0.09
Nodes (21): bool, byte, ConcurrentDictionary, DateTime, IDisposable, long, int, IntPtr (+13 more)

### Community 27 - "Groups View & PDSU Flagged UI"
Cohesion: 0.07
Nodes (29): driverFilter, emit, filteredDrivers, filteredServices, filteredSoftware, { isAdmin }, props, router (+21 more)

### Community 28 - "VNC Bridge & Agent Roadmap Docs"
Cohesion: 0.08
Nodes (31): COMMAND_TYPES, License/Warranty Asset Tracking Roadmap Idea, Audit Log of Admin Actions Roadmap Idea, Configurable Alerting Roadmap Idea, Deployment Group Targeting (test/it/pilot/rest), DNS Query Logging Evolution (ETW to Npcap to WinDivert), Installer Package/GPO Distribution Roadmap Idea, Missing Real-Time Command Channel (+23 more)

### Community 29 - "DNS Logs View (Frontend)"
Cohesion: 0.08
Nodes (31): DnsLogsView(), addToBlacklist(), blacklist, blacklistDomain(), blacklistLimit, blacklistPage, blacklistSearch, blacklistSearchInput (+23 more)

### Community 30 - "Job Executor & Process Runner (C#)"
Cohesion: 0.11
Nodes (17): ProcessResult, DllImport, IEnumerable, int, IntPtr, JObject, string, TimeSpan (+9 more)

### Community 31 - "Home View (IP List, Frontend)"
Cohesion: 0.07
Nodes (26): activeFilterCount, { confirmState, askConfirm, resolveConfirm }, counts, currentPageDisplay, deleteEntry(), departmentOptions, duplicateTotalGroups, duplicateTotalRows (+18 more)

### Community 32 - "Hardware Collector (C#)"
Cohesion: 0.19
Nodes (7): ManagementBaseObject, ManagementObject, List, List, HardwareCollector, StorageInfo, WmiUtils

### Community 33 - "Agent HTTP Models (C#)"
Cohesion: 0.09
Nodes (15): Task, JObject, List, JobItem, JobResultRequest, JobsResponse, EnrollRequest, EnrollResponse (+7 more)

### Community 34 - "Agent Releases View (Frontend)"
Cohesion: 0.07
Nodes (19): { confirmState, askConfirm, resolveConfirm }, deploymentGroupOptions, diskFiles, editForm, fetchData(), fetchDeploymentGroupOptions(), form, items (+11 more)

### Community 35 - "Inventory Collector Models (C#)"
Cohesion: 0.11
Nodes (25): Func, List, InventoryCollector, List, AvailableUpdateItem, BiosInfo, CpuInfo, DnsQueryItem (+17 more)

### Community 36 - "Inventory CRUD"
Cohesion: 0.15
Nodes (24): createInventoryItemController(), deleteInventoryItemController(), exportInventoryController(), getInventoryItemController(), labelForSite(), SITE_LABELS, siteFilter(), updateInventoryItemController() (+16 more)

### Community 37 - "PDSU Controller & Routes"
Cohesion: 0.18
Nodes (27): addFlaggedExceptionController(), clearPdsuController(), FLAG_KINDS, getAvailableUpdatesController(), getComputerByIpController(), getComputerController(), getDriversController(), getEventLogsController() (+19 more)

### Community 38 - "Server Health View (Frontend)"
Cohesion: 0.07
Nodes (28): ServerHealthView(), { confirmState, askConfirm, resolveConfirm }, cpuPoints, dbSizePoints, fmtHistTime(), ghostAudit, ghostAuditLoading, ghostCleaning (+20 more)

### Community 39 - "Date/Log Formatting Helpers"
Cohesion: 0.08
Nodes (23): fmtDate(), hovered, props, rangeLabel, segments, LogsView(), fmtDate(), fmtDate() (+15 more)

### Community 40 - "Inventory View (Frontend)"
Cohesion: 0.09
Nodes (22): INVENTORY_TYPE_OPTIONS, labelForInventoryType(), InventoryView(), activeFilterCount, confirmDelete(), { confirmState, askConfirm, resolveConfirm }, currentPageDisplay, entries (+14 more)

### Community 41 - "PDSU Updates Formatting"
Cohesion: 0.10
Nodes (21): ageBadgeClass(), ageLabel(), cryptoSafeKey(), daysSince(), { formatNumber, formatDate, barWidth }, freshness, freshnessBuckets, freshnessClass() (+13 more)

### Community 42 - "Batch Job Detail View (Frontend)"
Cohesion: 0.10
Nodes (20): BatchJobDetailView(), batch, cancelBatch(), cancellableCount, cancelling, cancellingItemId, cancelSingleJob(), { confirmState, askConfirm, resolveConfirm } (+12 more)

### Community 43 - "Repack Groups & Group Select"
Cohesion: 0.09
Nodes (21): addGroup(), adding, allOptions, emit, newGroupName, props, showAddForm, ComputersForRepackView() (+13 more)

### Community 44 - "IP Metadata View (Frontend)"
Cohesion: 0.09
Nodes (21): IpMetaView(), { confirmState, askConfirm, resolveConfirm }, entry, entryError, entryLoading, exportingPdf, { isAdmin }, loadEntry() (+13 more)

### Community 45 - "Service & Windows Update Collectors (C#)"
Cohesion: 0.17
Nodes (6): dynamic, List, ServiceCollector, List, WindowsUpdateCollector, MonitoringCollector

### Community 46 - "Agent Service Installers (C#)"
Cohesion: 0.15
Nodes (8): Installer, IDictionary, string, ProjectInstaller, Program, IDictionary, string, ProjectInstaller

### Community 47 - "Agent Manager File Sync (C#)"
Cohesion: 0.16
Nodes (9): AutoResetEvent, ManagerCommand, DirectorySync, CancellationToken, object, Task, TimeSpan, ManagerWorker (+1 more)

### Community 48 - "Flagged Domains & DNS Query List"
Cohesion: 0.18
Nodes (17): createFlaggedDomainController(), deleteFlaggedDomainController(), listDnsQueriesController(), siteFilter(), FlagDomainSchema, deleteFlaggedDomain(), findFlaggedDomainMatch(), FLAGGED_DOMAIN_MATCH_SQL (+9 more)

### Community 49 - "Metadata PDF Export & Search"
Cohesion: 0.18
Nodes (19): clearMetadataController(), exportComputerMetadataPdfController(), exportWithoutMetadataPdfController(), listMetadataController(), listWithoutMetadataController(), searchMetadataController(), siteFilter(), statsController() (+11 more)

### Community 50 - "PDSU Service Label Formatting"
Cohesion: 0.15
Nodes (17): automaticStopped, { formatNumber, formatDate: formatDateBase, splitValues }, props, rareServices, runningPercent, stats, stoppedPercent, tables (+9 more)

### Community 51 - "Confirm Dialogs & Deployment Group UI"
Cohesion: 0.15
Nodes (22): askConfirm(), parseError(), addDeploymentGroup(), cancelJob(), confirmClearJobs(), confirmDelete(), confirmRevoke(), installSelectedRelease() (+14 more)

### Community 52 - "Add/Edit IP View (Frontend)"
Cohesion: 0.12
Nodes (19): createIpEntryForm(), IP_ENTRY_DEFAULTS, IP_ENTRY_FIELDS, IP_OPTIONAL_FIELDS, IPV4_REGEX, validateIpv4(), EditIpView(), ipError (+11 more)

### Community 53 - "Backend Runtime Dependencies"
Cohesion: 0.10
Nodes (21): adm-zip, dependencies, adm-zip, bcryptjs, exceljs, express, multer, mysql2 (+13 more)

### Community 54 - "Push Subscriptions"
Cohesion: 0.17
Nodes (15): VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT, pushPublicKeyController(), subscribePushController(), unsubscribePushController(), SubscribePushSchema, UnsubscribePushSchema (+7 more)

### Community 55 - "PDSU Overview Panel (Frontend)"
Cohesion: 0.10
Nodes (16): alertItems, allManagerAgentsSelected, coverageItems, driverStats, emit, { formatNumber, formatDate: formatDateBase }, managerAgentRows, printerStats (+8 more)

### Community 56 - "Reports View (Frontend)"
Cohesion: 0.13
Nodes (20): ReportsView(), anomalies, blacklistedDomainHits, downloadingPdf, error, generateNow(), generating, history (+12 more)

### Community 57 - "VNC Session View (Frontend)"
Cohesion: 0.13
Nodes (19): VncSessionView(), agent, applyManualScale(), buildWsUrl(), cleanup(), connected, handleFullscreenChange(), handleWindowResize() (+11 more)

### Community 58 - "Paginated Route Composable"
Cohesion: 0.15
Nodes (15): fieldsEqual(), parseField(), queryValue(), serializeField(), usePaginatedRoute(), buildQuery(), isQuerySynced(), BatchJobsView() (+7 more)

### Community 59 - "Free IP Addresses View"
Cohesion: 0.11
Nodes (18): FreeIpAddressesView(), fetchData(), filteredIps, freeIps, ipToNum(), loadError, loading, occupiedCount (+10 more)

### Community 60 - "Notifications Aggregation Queries"
Cohesion: 0.26
Nodes (16): listNotificationsController(), siteFilter(), CONNECTIVITY_STATUS_SQL, countAgentOfflineButIpOnline(), countAntivirusInactiveAgents(), countAutomaticStoppedServices(), countBlacklistedDomainHits(), countDiskFullAgents() (+8 more)

### Community 61 - "Backend Dev Dependencies"
Cohesion: 0.11
Nodes (19): devDependencies, eslint, @eslint/js, eslint-plugin-import, eslint-plugin-sonarjs, globals, nodemon, supertest (+11 more)

### Community 62 - "Agent Auth Test Helpers"
Cohesion: 0.16
Nodes (6): insertAgent(), enrollAgent(), app, insertTestAgent(), generateApiKey(), hashApiKey()

### Community 63 - "PDSU Printers Panel (Frontend)"
Cohesion: 0.11
Nodes (15): activePerComputer, computersWithMostPrinters, exportingActivePrintersPdf, { formatNumber, formatDate: formatDateBase, splitValues }, groupedByManufacturer, problemStatus, props, rarePrinters (+7 more)

### Community 64 - "Math/Stat Helpers & Metadata"
Cohesion: 0.22
Nodes (15): avg(), barWidth(), maxOf(), median(), round1(), sum(), cpuClockGHzOf(), cpuCoresOf() (+7 more)

### Community 65 - "Env Config & Migrations"
Cohesion: 0.22
Nodes (12): DB_CONNECTION_LIMIT, DB_HOST, DB_NAME, DB_PASS, DB_PORT, DB_USER, SSL_CERT, SSL_KEY (+4 more)

### Community 66 - "Server Startup & Scheduled Jobs"
Cohesion: 0.20
Nodes (13): HOST, PORT, getSslOptions(), generateReportController(), insertStatusHistoryBulk(), connectMySql(), startServer(), generateDailyReportsForAllSites() (+5 more)

### Community 67 - "VNC Session Backend (Service/Relay)"
Cohesion: 0.26
Nodes (14): VNC_SHARED_PASSWORD, startVncSessionController(), findVncSessionById(), insertVncSession(), markVncSessionActive(), markVncSessionEnded(), endVncSessionService(), startVncSessionService() (+6 more)

### Community 68 - "IP Entry Metadata Endpoints"
Cohesion: 0.27
Nodes (13): getMetadataByIpController(), patchMetadataByIpController(), requireValidIp(), upsertMetadataByIpController(), findIpEntryByIdLean(), findIpEntryIdByIp(), router, getMetadataByIp() (+5 more)

### Community 69 - "Event Log Collector (C#)"
Cohesion: 0.18
Nodes (8): Dictionary, EventRecord, EventLogBookmarks, int, List, string, EventLogCollector, EventLogItem

### Community 70 - "Frontend Dev Dependencies"
Cohesion: 0.12
Nodes (17): eslint-plugin-vue, devDependencies, @eslint/js, eslint-plugin-vue, globals, jsdom, prettier, vite (+9 more)

### Community 71 - "PDF/XLSX Export Frontend Helpers"
Cohesion: 0.21
Nodes (16): exportActivePrintersPdf(), downloadBlob(), downloadFromResponse(), fetchWithAuth(), exportPdf(), exportToXlsx(), exportToXlsx(), exportPdf() (+8 more)

### Community 72 - "Users View & Slide-Over Panel"
Cohesion: 0.17
Nodes (13): UsersView(), changeRole(), confirmDelete(), { confirmState, askConfirm, resolveConfirm }, createUser(), { currentUser }, error, fetchData() (+5 more)

### Community 73 - "Add IP View & Entry Types"
Cohesion: 0.14
Nodes (14): ENTRY_TYPE_OPTIONS, labelForEntryType(), AddIpView(), currentSite, entryTypeModel, error, fetchGroupOptions(), form (+6 more)

### Community 74 - "Downloads Folder View"
Cohesion: 0.14
Nodes (14): DownloadsFolderView(), { confirmState, askConfirm, resolveConfirm }, copyLink(), fetchData(), fileInputRef, fmtDate(), items, loading (+6 more)

### Community 75 - "Manager Command Client & Update Manager (C#)"
Cohesion: 0.19
Nodes (7): InvalidOperationException, int, string, ManagerCommandClient, Task, UpdateManager, X509Certificate2

### Community 76 - "Site Switcher & Selection"
Cohesion: 0.17
Nodes (11): currentSite, label, route, router, isValidSite(), labelForSite(), SITE_OPTIONS, SITE_VALUES (+3 more)

### Community 77 - "App Settings & Feature Flags"
Cohesion: 0.27
Nodes (11): listSettingsController(), updateSettingController(), APP_SETTINGS, SETTING_KEYS, UpdateSettingSchema, getSettingValue(), listStoredSettings(), upsertSetting() (+3 more)

### Community 78 - "Frontend Runtime Dependencies"
Cohesion: 0.13
Nodes (15): dependencies, dotenv, @novnc/novnc, tailwindcss, @tailwindcss/vite, vue, vue-router, xlsx (+7 more)

### Community 79 - "App Layout & Footer Components"
Cohesion: 0.17
Nodes (9): { year, copyright, version }, route, trail, useAppInfo(), { copyright }, { currentUser }, userInitial, MainLayout() (+1 more)

### Community 80 - "Repack Recommendations View"
Cohesion: 0.14
Nodes (12): RepackRecommendationsView(), cpuTierFilter, fetchData(), filteredItems, items, loadError, loading, markForRepack() (+4 more)

### Community 81 - "Pagination & List Controllers"
Cohesion: 0.29
Nodes (9): listReleasesController(), listUpdateLogController(), listFlaggedDomainsController(), listInventoryController(), listServerHealthHistoryController(), listInventory(), clamp(), toInt() (+1 more)

### Community 82 - "Toast & Change Password UI"
Cohesion: 0.19
Nodes (9): close(), confirmPassword, currentPassword, newPassword, open, save(), saving, { toast, showToast } (+1 more)

### Community 83 - "PDSU Software Panel (Frontend)"
Cohesion: 0.15
Nodes (11): computersWithMostSoftware, { formatNumber, formatDate: formatDateBase, barWidth, splitValues }, maxPublisherInstallations, maxTopSoftwareComputers, multipleVersions, props, rareSoftware, stats (+3 more)

### Community 84 - "Abortable Fetch Composable"
Cohesion: 0.19
Nodes (12): useAbortableFetch(), abort(), getSignal(), applyServerPagination(), fetchData(), fetchData(), fetchData(), fetchMissingMetadata() (+4 more)

### Community 85 - "Duplicate Names View"
Cohesion: 0.18
Nodes (9): useCurrentSite(), DuplicateNamesView(), duplicateGroups, error, loadDuplicates(), loading, router, site (+1 more)

### Community 86 - "Number/Date Formatting Utils"
Cohesion: 0.31
Nodes (10): fmtDateOnly(), fmtDateSr(), fmtGb(), fmtMbps(), fmtNumberSr(), fmtPct(), fmtRelative(), fmtTb() (+2 more)

### Community 87 - "Computers Without Agent View"
Cohesion: 0.17
Nodes (12): ComputersWithoutAgentView(), clearSearch(), exportingPdf, { getSignal, abort }, items, loading, onSearchInput(), { page, limit, search, nextPage, prevPage, applyServerPagination } (+4 more)

### Community 88 - "Process Detections View"
Cohesion: 0.17
Nodes (12): ProcessDetectionsView(), clearSearch(), fmtDate(), { getSignal, abort }, items, loading, onSearchInput(), { page, limit, search, sortBy, sortOrder, nextPage, prevPage, applyServerPagination } (+4 more)

### Community 89 - "PDSU Drivers Panel (Frontend)"
Cohesion: 0.17
Nodes (9): computersWithMostDrivers, { formatNumber, formatDate, barWidth, splitValues }, maxManufacturerDrivers, multipleVersions, oldestDrivers, props, stats, tables (+1 more)

### Community 90 - "Agent Solution Structure (net452)"
Cohesion: 0.20
Nodes (11): Newtonsoft.Json (13.0.3), WebSocketSharp-netstandard (1.0.1), Netdesk.Agent.Common, net452, Microsoft.NET.Sdk, Netdesk.Agent.Manager, net452, Microsoft.NET.Sdk (+3 more)

### Community 91 - "Windows Service Lifecycle (C#)"
Cohesion: 0.17
Nodes (7): CancellationTokenSource, Task, NetdeskAgentManagerService, CancellationTokenSource, Task, NetdeskAgentService, ServiceBase

### Community 92 - "Process Detections Backend"
Cohesion: 0.31
Nodes (8): listProcessDetectionsController(), siteFilter(), SITES, listProcessDetections(), upsertProcessDetectionsBulk(), ingestProcessDetections(), listProcessDetectionsService(), SORT_FIELDS

### Community 93 - "Domain Blacklist Sync"
Cohesion: 0.31
Nodes (8): bulkInsertFlaggedDomains(), FETCHED_SOURCES, fetchText(), parseHostsFileDomains(), parseUrlhausCsvDomains(), STREAMING_DOMAINS, syncDomainBlacklists(), startDomainBlacklistSyncLoop()

### Community 94 - "Trend Analysis & Anomaly Detection"
Cohesion: 0.38
Nodes (8): computeCpuAnomaly(), computeDiskAnomaly(), computeDiskFillProjection(), computeMetricAnomaly(), computeRamAnomaly(), computeThresholdProjection(), linearRegressionSlope(), sortedPoints()

### Community 95 - "Deployment Groups View (Frontend)"
Cohesion: 0.18
Nodes (9): DeploymentGroupsView(), adding, { confirmState, askConfirm, resolveConfirm }, { isAdmin }, items, loading, newGroupName, router (+1 more)

### Community 96 - "VNC Bridge WebSocket Relay (C#)"
Cohesion: 0.27
Nodes (7): NetworkStream, CancellationToken, int, Task, VncBridge, TaskCompletionSource, WebSocket

### Community 97 - "Software Collector (C#)"
Cohesion: 0.31
Nodes (6): RegistryKey, RegistryView, SoftwareItem, List, string, SoftwareCollector

### Community 98 - "Agent Job DTOs"
Cohesion: 0.29
Nodes (7): BatchCreateJobSchema, COMMAND_TYPES, CreateJobSchema, JobCommandFields, JobListQuerySchema, JobResultSchema, SERVICE_COMMANDS

### Community 99 - "Theme Init & Tests"
Cohesion: 0.20
Nodes (6): Pre-Paint Theme Init Script, frontend index.html, media, theme, main.js, theme-init.js

### Community 100 - "MultiSelect Component"
Cohesion: 0.22
Nodes (8): emit, filteredOptions, filterText, open, props, rootEl, summaryLabel, toggle()

### Community 101 - "Theme Toggle Composable"
Cohesion: 0.22
Nodes (7): cycle(), icons, order, { theme, setTheme }, titles, useTheme(), setTheme()

### Community 102 - "Config View & Toast Component"
Cohesion: 0.24
Nodes (8): ConfigView(), error, fetchData(), loading, saving, settings, { toast, showToast }, toggle()

### Community 103 - "Daily Report Services"
Cohesion: 0.39
Nodes (8): getLatestReportController(), getReportByIdController(), getReportPdfController(), listReportsController(), siteFilter(), getLatestReportService(), getReportByIdService(), listReportsService()

### Community 104 - "PDSU Repository Queries"
Cohesion: 0.28
Nodes (9): exportComputerPdsuPdfController(), fmtRowDates(), computerDriversList(), computerServicesList(), computerSoftwareList(), getComputerDrivers(), getComputerServices(), getComputerSoftware() (+1 more)

### Community 105 - "IP Address DTOs"
Cohesion: 0.33
Nodes (6): EntryTypeEnum, ListSchema, PendingRepackSchema, RDP_APP_PATTERNS, ScanSchema, UpsertIpSchema

### Community 106 - "Backend Package Metadata"
Cohesion: 0.22
Nodes (8): author, description, keywords, license, main, name, type, version

### Community 107 - "Frontend Package Scripts"
Cohesion: 0.22
Nodes (9): scripts, build, dev, format, lint, lint:fix, preview, test (+1 more)

### Community 108 - "VNC Viewer & Shared UI Components"
Cohesion: 0.22
Nodes (3): emit, props, router

### Community 109 - "Push Notifications Composable"
Cohesion: 0.33
Nodes (6): { isSupported, isSubscribed, loading, error, checkSubscription, subscribe, unsubscribe }, toggle(), urlBase64ToUint8Array(), usePushNotifications(), subscribe(), unsubscribe()

### Community 110 - "Login View"
Cohesion: 0.22
Nodes (7): LoginView(), errorMessage, password, route, router, username, { year, copyright }

### Community 113 - "Backend ESLint Ignore Patterns"
Cohesion: 0.25
Nodes (7): ignorePatterns, dist/, node_modules/, build/, coverage/, .git/, *.min.js

### Community 114 - "Deployment Group Picker Component"
Cohesion: 0.36
Nodes (7): addCustom(), allOptions, customInput, emit, isChecked(), props, toggle()

### Community 115 - "Agent Detail Job Tabs"
Cohesion: 0.29
Nodes (8): createJob(), loadDnsLogs(), loadEventLogs(), loadJobs(), loadUpdateLog(), selectTab(), sendFixJob(), stopJobsPolling()

### Community 116 - "PDSU Flagging Actions (Frontend)"
Cohesion: 0.46
Nodes (8): error, fetchFlagged(), flagDriver(), flagService(), flagSoftware(), removeFlaggedDriver(), removeFlaggedService(), removeFlaggedSoftware()

### Community 117 - "Agents View Batch Actions"
Cohesion: 0.29
Nodes (7): assignDeploymentGroupToSelected(), buildFilterParams(), clearSelection(), confirmRevoke(), fetchData(), selectAllMatching(), sendBatchJob()

### Community 118 - "File Logger (C#)"
Cohesion: 0.33
Nodes (4): Exception, object, string, FileLogger

### Community 119 - "Backend NPM Scripts"
Cohesion: 0.33
Nodes (6): scripts, dev, migrate, start, test, test:watch

### Community 120 - "Event Logs Service"
Cohesion: 0.60
Nodes (4): insertEventLogsBulk(), listEventLogs(), ingestEventLogs(), listEventLogsService()

### Community 121 - "Frontend jsconfig Paths"
Cohesion: 0.33
Nodes (5): compilerOptions, paths, exclude, dist, node_modules

### Community 122 - "App Navigation Component"
Cohesion: 0.33
Nodes (4): baseLinks, { isOperatorOrAdmin, isRootAdmin }, links, route

### Community 123 - "Notification Ticker Component"
Cohesion: 0.33
Nodes (5): levelClass, levelIcon, load(), loopItems, notifications

### Community 124 - "Frontend Package Identity"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 125 - "Prettier Config"
Cohesion: 0.40
Nodes (4): printWidth, $schema, semi, singleQuote

### Community 126 - "PDSU Stats Fetch Helpers"
Cohesion: 0.40
Nodes (5): fetchMissingPdsu(), fetchWithoutNetdeskAgentManager(), fetchWithoutUltravnc(), loadStats(), sendManagerInstallJob()

### Community 127 - "Agent Version Constant (C#)"
Cohesion: 0.50
Nodes (3): NetdeskAgent.Common, string, AgentVersionInfo

### Community 129 - "Agent Command Constants"
Cohesion: 0.50
Nodes (3): COMMAND_LABELS, COMMAND_TYPES, SERVICE_COMMANDS

## Ambiguous Edges - Review These
- `Netdesk Agent Manager (NetdeskAgentManager Service)` → `Netdesk.Agent.Updater (legacy separate update process)`  [AMBIGUOUS]
  service/README.md · relation: conceptually_related_to
- `RBAC Roles (admin/operator/viewer)` → `RBAC/Permissions Roadmap Idea`  [AMBIGUOUS]
  docs/agent-roadmap.md · relation: conceptually_related_to

## Knowledge Gaps
- **799 isolated node(s):** `node_modules/`, `dist/`, `build/`, `coverage/`, `.git/` (+794 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Netdesk Agent Manager (NetdeskAgentManager Service)` and `Netdesk.Agent.Updater (legacy separate update process)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `RBAC Roles (admin/operator/viewer)` and `RBAC/Permissions Roadmap Idea`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `NetDesk TECHNICAL.md` connect `Docs, Skills & Feature Flags` to `Theme Init & Tests`, `Backend Integration Test Helpers`, `Push Notifications Composable`, `App Settings & Feature Flags`, `VNC Bridge & Agent Roadmap Docs`, `Trend Analysis & Anomaly Detection`?**
  _High betweenness centrality (0.286) - this node is a cross-community bridge._
- **Why does `Netdesk Agent README` connect `VNC Bridge & Agent Roadmap Docs` to `Agent Releases & Update Targeting`, `Docs, Skills & Feature Flags`, `C# Agent Common Collectors`, `PowerShell Presets Constant`, `DNS Query Capture (WinDivert, C#)`?**
  _High betweenness centrality (0.224) - this node is a cross-community bridge._
- **Why does `fetchWithAuth()` connect `PDF/XLSX Export Frontend Helpers` to `Agent Detail View Helpers`, `Metadata View Hardware Distributions`, `Frontend Views & Auth Utils`, `Agents List Filters (Frontend)`, `Printers View (Frontend)`, `PDSU View (IP Detail, Frontend)`, `PDSU Analytics View (Frontend)`, `Groups View & PDSU Flagged UI`, `DNS Logs View (Frontend)`, `Home View (IP List, Frontend)`, `Agent Releases View (Frontend)`, `Server Health View (Frontend)`, `Date/Log Formatting Helpers`, `Inventory View (Frontend)`, `Batch Job Detail View (Frontend)`, `Repack Groups & Group Select`, `IP Metadata View (Frontend)`, `Confirm Dialogs & Deployment Group UI`, `Add/Edit IP View (Frontend)`, `Reports View (Frontend)`, `VNC Session View (Frontend)`, `Paginated Route Composable`, `Free IP Addresses View`, `PDSU Printers Panel (Frontend)`, `Users View & Slide-Over Panel`, `Add IP View & Entry Types`, `Downloads Folder View`, `Repack Recommendations View`, `Toast & Change Password UI`, `Abortable Fetch Composable`, `Duplicate Names View`, `Computers Without Agent View`, `Process Detections View`, `Deployment Groups View (Frontend)`, `Config View & Toast Component`, `Push Notifications Composable`, `Agent Detail Job Tabs`, `PDSU Flagging Actions (Frontend)`, `Agents View Batch Actions`, `Notification Ticker Component`, `PDSU Stats Fetch Helpers`?**
  _High betweenness centrality (0.160) - this node is a cross-community bridge._
- **What connects `node_modules/`, `dist/`, `build/` to the rest of the system?**
  _799 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PDSU PDF/XLSX Export & Reports` be split into smaller, more focused modules?**
  _Cohesion score 0.06031746031746032 - nodes in this community are weakly interconnected._