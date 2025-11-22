import { createRouter, createWebHistory } from 'vue-router'

const MainLayout = () => import('@/layouts/MainLayout.vue')
const HomeView = () => import('@/views/HomeView.vue')
const LoginView = () => import('@/views/LoginView.vue')
const NotFoundView = () => import('@/views/NotFoundView.vue')
const AddIpView = () => import('@/views/AddIpView.vue')
const EditIpView = () => import('@/views/EditIpView.vue')
const MetadataView = () => import('@/views/MetadataView.vue')
const PrintersView = () => import('@/views/PrintersView.vue')
const DomainsView = () => import('@/views/DomainsView.vue')
const InventoryView = () => import('@/views/InventoryView.vue')

function decodeJwt(token) {
  try {
    const [, payload] = token.split('.')
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(b64)
    return JSON.parse(json)
  } catch {
    return null
  }
}
function isTokenExpired(token) {
  const p = decodeJwt(token)
  if (!p || !p.exp) return true
  return Date.now() > p.exp * 1000 - 5000
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: MainLayout,
      meta: { requiresAuth: true, title: 'Početna - NetDesk' },
      children: [
        { path: '', name: 'home', meta: { title: 'Početna - NetDesk' }, component: HomeView },
        {
          path: 'add',
          name: 'add-ip',
          meta: { title: 'Dodaj IP - NetDesk' },
          component: AddIpView,
        },
        {
          path: 'edit/:id',
          name: 'edit-ip',
          meta: { title: 'Uredi IP - NetDesk' },
          component: EditIpView,
        },
        {
          path: 'metadata',
          name: 'metadata',
          meta: { title: 'Metapodaci - NetDesk' },
          component: MetadataView,
        },
        {
          path: 'printers',
          name: 'printers',
          meta: { title: 'Štampači - NetDesk' },
          component: PrintersView,
        },
        {
          path: 'domains',
          name: 'domains',
          meta: { title: 'DNS logovi - NetDesk' },
          component: DomainsView,
        },
        {
          path: 'inventory',
          name: 'inventory',
          meta: { title: 'Inventar hardvera - NetDesk' },
          component: InventoryView,
        },
      ],
    },
    {
      path: '/login',
      name: 'login',
      meta: { guestOnly: true, title: 'Prijavi se - NetDesk' },
      component: LoginView,
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
      const returnTo = encodeURIComponent(to.fullPath || '/')
      return next(`/login?returnTo=${returnTo}`)
    }
  }

  if (to.meta.guestOnly && token && !isTokenExpired(token)) {
    return next('/')
  }

  next()
})

router.afterEach((to) => {
  const title = to.meta?.title || 'NetDesk'
  if (typeof document !== 'undefined') document.title = title
})

export default router
