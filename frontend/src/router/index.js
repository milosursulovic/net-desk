import { createRouter, createWebHistory } from 'vue-router'
import { isTokenExpired, decodeJwt } from '@/utils/auth.js'
import { resetCurrentUser } from '@/composables/useCurrentUser.js'
import { isValidSite } from '@/constants/sites.js'
import { getRememberedSite, rememberSite } from '@/utils/siteStorage.js'
import { i18n } from '@/i18n/index.js'

const MainLayout = () => import('@/layouts/MainLayout.vue')
const HomeView = () => import('@/views/HomeView.vue')
const LoginView = () => import('@/views/LoginView.vue')
const SelectSiteView = () => import('@/views/SelectSiteView.vue')
const NotFoundView = () => import('@/views/NotFoundView.vue')
const AddIpView = () => import('@/views/AddIpView.vue')
const FreeIpAddressesView = () => import('@/views/FreeIpAddressesView.vue')
const EditIpView = () => import('@/views/EditIpView.vue')
const MetadataView = () => import('@/views/MetadataView.vue')
const PrintersView = () => import('@/views/PrintersView.vue')
const InventoryView = () => import('@/views/InventoryView.vue')
const PDSUAnalyticsView = () => import('@/views/PDSUAnalyticsView.vue')
const IpMetaView = () => import('@/views/IpMetaView.vue')
const IpPdsuView = () => import('@/views/IpPdsuView.vue')
const IpPortScanView = () => import('@/views/IpPortScanView.vue')
const DuplicateNamesView = () => import('@/views/DuplicateNamesView.vue')
const ComputersForRepackView = () => import('@/views/ComputersForRepackView.vue')
const RepackRecommendationsView = () => import('@/views/RepackRecommendationsView.vue')
const AgentsView = () => import('@/views/AgentsView.vue')
const AgentDetailView = () => import('@/views/AgentDetailView.vue')
const AgentReleasesView = () => import('@/views/AgentReleasesView.vue')
const BatchJobsView = () => import('@/views/BatchJobsView.vue')
const BatchJobDetailView = () => import('@/views/BatchJobDetailView.vue')
const ComputersWithoutAgentView = () => import('@/views/ComputersWithoutAgentView.vue')
const DownloadsFolderView = () => import('@/views/DownloadsFolderView.vue')
const ReportsView = () => import('@/views/ReportsView.vue')
const UsersView = () => import('@/views/UsersView.vue')
const LogsView = () => import('@/views/LogsView.vue')
const ConfigView = () => import('@/views/ConfigView.vue')
const ServerHealthView = () => import('@/views/ServerHealthView.vue')
const DnsLogsView = () => import('@/views/DnsLogsView.vue')
const ProcessDetectionsView = () => import('@/views/ProcessDetectionsView.vue')
const GroupsView = () => import('@/views/GroupsView.vue')
const DeploymentGroupsView = () => import('@/views/DeploymentGroupsView.vue')
const VncSessionView = () => import('@/views/VncSessionView.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: MainLayout,
      meta: { requiresAuth: true, titleKey: 'routes.home' },
      children: [
        {
          path: '',
          name: 'home',
          meta: { titleKey: 'routes.home', breadcrumbKey: 'nav.ipAddresses' },
          component: HomeView,
        },
        {
          path: 'add',
          name: 'add-ip',
          meta: {
            titleKey: 'routes.addIp',
            breadcrumbKey: 'routes.addIp',
            breadcrumbParent: { labelKey: 'nav.ipAddresses', to: '/' },
          },
          component: AddIpView,
        },
        {
          path: 'free-ip-addresses',
          name: 'free-ip-addresses',
          meta: {
            titleKey: 'freeIps.title',
            breadcrumbKey: 'freeIps.title',
            breadcrumbParent: { labelKey: 'nav.ipAddresses', to: '/' },
          },
          component: FreeIpAddressesView,
        },
        {
          path: 'edit/:id',
          name: 'edit-ip',
          meta: {
            titleKey: 'routes.editIp',
            breadcrumbKey: 'routes.editIp',
            breadcrumbParent: { labelKey: 'nav.ipAddresses', to: '/' },
            // A specific existing entry, its own site already known from the DB.
            requiresSite: false,
          },
          component: EditIpView,
        },
        {
          path: 'ip/:id/meta',
          name: 'ip-meta',
          meta: {
            titleKey: 'nav.metadata',
            breadcrumbKey: 'nav.metadata',
            breadcrumbParent: { labelKey: 'nav.ipAddresses', to: '/' },
            // Per-computer detail page - the site is already implicit through
            // that single IP entry (its own site in the DB), no filter needed.
            requiresSite: false,
          },
          component: IpMetaView,
        },
        {
          path: 'ip/:id/pdsu',
          name: 'ip-pdsu',
          meta: {
            titleKey: 'routes.pdsuInventory',
            breadcrumbKey: 'routes.pdsuInventory',
            breadcrumbParent: { labelKey: 'nav.ipAddresses', to: '/' },
            requiresSite: false,
          },
          component: IpPdsuView,
        },
        {
          path: 'ip/:id/port-scan',
          name: 'ip-port-scan',
          meta: {
            titleKey: 'routes.portScan',
            breadcrumbKey: 'routes.portScan',
            breadcrumbParent: { labelKey: 'nav.ipAddresses', to: '/' },
            requiresSite: false,
          },
          component: IpPortScanView,
        },
        {
          path: 'duplicates',
          name: 'duplicates',
          meta: {
            titleKey: 'duplicates.title',
            breadcrumbKey: 'duplicates.title',
            breadcrumbParent: { labelKey: 'nav.ipAddresses', to: '/' },
          },
          component: DuplicateNamesView,
        },
        {
          path: 'computers-for-repack',
          name: 'computers-for-repack',
          meta: {
            titleKey: 'repack.title',
            breadcrumbKey: 'repack.title',
            breadcrumbParent: { labelKey: 'nav.ipAddresses', to: '/' },
          },
          component: ComputersForRepackView,
        },
        {
          path: 'repack-recommendations',
          name: 'repack-recommendations',
          meta: {
            titleKey: 'routes.repackRecommendations',
            breadcrumbKey: 'routes.repackRecommendations',
            breadcrumbParent: { labelKey: 'repack.title', to: '/computers-for-repack' },
          },
          component: RepackRecommendationsView,
        },
        {
          path: 'groups',
          name: 'groups',
          meta: {
            titleKey: 'groups.title',
            breadcrumbKey: 'groups.title',
            breadcrumbParent: { labelKey: 'nav.ipAddresses', to: '/' },
          },
          component: GroupsView,
        },
        {
          path: 'deployment-groups',
          name: 'deployment-groups',
          meta: {
            titleKey: 'deploymentGroups.title',
            breadcrumbKey: 'deploymentGroups.title',
            breadcrumbParent: { labelKey: 'nav.agents', to: '/agents' },
          },
          component: DeploymentGroupsView,
        },
        {
          path: 'metadata',
          name: 'metadata',
          meta: { titleKey: 'nav.metadata', breadcrumbKey: 'nav.metadata' },
          component: MetadataView,
        },
        {
          path: 'printers',
          name: 'printers',
          meta: { titleKey: 'nav.printers', breadcrumbKey: 'nav.printers' },
          component: PrintersView,
        },
        {
          path: 'inventory',
          name: 'inventory',
          meta: { titleKey: 'inventory.title', breadcrumbKey: 'inventory.title' },
          component: InventoryView,
        },
        {
          path: 'pdsu',
          name: 'pdsu',
          meta: { titleKey: 'routes.pdsuAnalytics', breadcrumbKey: 'routes.pdsuAnalytics' },
          component: PDSUAnalyticsView,
        },
        {
          path: 'agents',
          name: 'agents',
          meta: { titleKey: 'routes.netdeskAgents', breadcrumbKey: 'nav.agents' },
          component: AgentsView,
        },
        {
          path: 'agents/:id',
          name: 'agent-detail',
          meta: {
            titleKey: 'routes.agentDetail',
            breadcrumbKey: 'routes.agentDetail',
            breadcrumbParent: { labelKey: 'nav.agents', to: '/agents' },
            // A specific agent, tied to one computer whose site is already known.
            requiresSite: false,
          },
          component: AgentDetailView,
        },
        {
          path: 'agent-releases',
          name: 'agent-releases',
          meta: {
            titleKey: 'releases.title',
            breadcrumbKey: 'releases.title',
            breadcrumbParent: { labelKey: 'nav.agents', to: '/agents' },
          },
          component: AgentReleasesView,
        },
        {
          path: 'agent-batches',
          name: 'agent-batches',
          meta: {
            titleKey: 'agents.batchCommands',
            breadcrumbKey: 'agents.batchCommands',
            breadcrumbParent: { labelKey: 'nav.agents', to: '/agents' },
          },
          component: BatchJobsView,
        },
        {
          path: 'agent-batches/:batchId',
          name: 'agent-batch-detail',
          meta: {
            titleKey: 'routes.batchStatus',
            breadcrumbKey: 'routes.batchStatus',
            breadcrumbParent: { labelKey: 'agents.batchCommands', to: '/agent-batches' },
            // A specific batch by id, it can include agents from both
            // sites - it makes no sense to tie it to one.
            requiresSite: false,
          },
          component: BatchJobDetailView,
        },
        {
          path: 'computers-without-agent',
          name: 'computers-without-agent',
          meta: {
            titleKey: 'withoutAgent.title',
            breadcrumbKey: 'withoutAgent.title',
            breadcrumbParent: { labelKey: 'nav.agents', to: '/agents' },
          },
          component: ComputersWithoutAgentView,
        },
        {
          path: 'downloads-folder',
          name: 'downloads-folder',
          meta: {
            titleKey: 'downloads.title',
            breadcrumbKey: 'downloads.title',
            breadcrumbParent: { labelKey: 'nav.agents', to: '/agents' },
            requiresAdmin: true,
          },
          component: DownloadsFolderView,
        },
        {
          path: 'reports',
          name: 'reports',
          meta: { titleKey: 'routes.dailyReport', breadcrumbKey: 'routes.reports' },
          component: ReportsView,
        },
        {
          path: 'reports/:id',
          name: 'report-detail',
          meta: {
            titleKey: 'routes.report',
            breadcrumbKey: 'routes.reportDetails',
            breadcrumbParent: { labelKey: 'routes.reports', to: '/reports' },
          },
          component: ReportsView,
        },
        {
          path: 'users',
          name: 'users',
          meta: { titleKey: 'routes.users', breadcrumbKey: 'routes.users', requiresRootAdmin: true },
          component: UsersView,
        },
        {
          path: 'logs',
          name: 'logs',
          meta: { titleKey: 'nav.logs', breadcrumbKey: 'nav.logs', requiresRootAdmin: true },
          component: LogsView,
        },
        {
          path: 'config',
          name: 'config',
          meta: { titleKey: 'nav.config', breadcrumbKey: 'nav.config', requiresRootAdmin: true },
          component: ConfigView,
        },
        {
          path: 'server-health',
          name: 'server-health',
          meta: { titleKey: 'nav.server', breadcrumbKey: 'nav.server', requiresOperator: true },
          component: ServerHealthView,
        },
        {
          path: 'dns-logs',
          name: 'dns-logs',
          meta: { titleKey: 'nav.dnsLogs', breadcrumbKey: 'nav.dnsLogs', requiresOperator: true },
          component: DnsLogsView,
        },
        {
          path: 'process-detections',
          name: 'process-detections',
          meta: { titleKey: 'nav.suspiciousProcesses', breadcrumbKey: 'nav.suspiciousProcesses', requiresOperator: true },
          component: ProcessDetectionsView,
        },
      ],
    },
    {
      path: '/login',
      name: 'login',
      meta: { guestOnly: true, titleKey: 'login.submit' },
      component: LoginView,
    },
    {
      // Outside MainLayout on purpose, same pattern as /login - cards for picking the
      // site (Bolnica/Dom zdravlja), before continuing to the requested
      // page. requiresSite: false so the guard doesn't enter an infinite loop
      // redirecting to itself.
      path: '/select-site',
      name: 'select-site',
      meta: { requiresAuth: true, requiresSite: false, titleKey: 'selectSite.title' },
      component: SelectSiteView,
    },
    {
      // Outside MainLayout on purpose - it opens in a separate browser window
      // (window.open from VncViewer.vue), so it needs no nav/sidebar chrome.
      // requiresSite: false - a standalone per-agent page, it doesn't filter by
      // site, so it shouldn't be redirected to /select-site.
      path: '/agents/:id/screen',
      name: 'agent-vnc-session',
      meta: { requiresAuth: true, requiresSite: false, titleKey: 'routes.vncSession' },
      component: VncSessionView,
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      meta: { title: '404 - NetDesk' },
      component: NotFoundView,
    },
  ],
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')

  if (to.meta.requiresAuth) {
    if (!token || isTokenExpired(token)) {
      localStorage.removeItem('token')
      resetCurrentUser()
      const returnTo = encodeURIComponent(to.fullPath || '/')
      return next(`/login?returnTo=${returnTo}`)
    }
    if (to.meta.requiresAdmin && decodeJwt(token)?.role !== 'admin') {
      return next('/')
    }
    // Above requiresAdmin - only the account with the username "admin" (not any
    // admin-role account), same reason as the backend's requireRootAdmin.
    if (
      to.meta.requiresRootAdmin &&
      (decodeJwt(token)?.role !== 'admin' || decodeJwt(token)?.username !== 'admin')
    ) {
      return next('/')
    }
    if (to.meta.requiresOperator && !['admin', 'operator'].includes(decodeJwt(token)?.role)) {
      return next('/')
    }

    // The site (Bolnica/Dom zdravlja) is carried as a URL query param on every
    // page (the user's explicit decision, links stay shareable/accurate) -
    // this is the same "guard-injects-state" approach as the auth check above,
    // just one place to change instead of touching dozens of existing
    // router-link/router.push calls. localStorage (via siteStorage.js) is the
    // fallback BELOW from.query.site - it handles a fresh tab/bookmark without ?site=,
    // which previously always threw the user to /select-site even when they were always
    // at the same site.
    if (to.meta.requiresSite !== false) {
      if (!isValidSite(to.query.site)) {
        const fallbackSite = isValidSite(from.query.site) ? from.query.site : getRememberedSite()
        if (isValidSite(fallbackSite)) {
          return next({ ...to, query: { ...to.query, site: fallbackSite } })
        }
        const returnTo = encodeURIComponent(to.fullPath || '/')
        return next(`/select-site?returnTo=${returnTo}`)
      }
      rememberSite(to.query.site)
    }
  }

  if (to.meta.guestOnly && token && !isTokenExpired(token)) {
    return next('/')
  }

  const title = to.meta?.titleKey ? `${i18n.global.t(to.meta.titleKey)} - NetDesk` : to.meta?.title || 'NetDesk'
  if (typeof document !== 'undefined') document.title = title

  next()
})

export default router
