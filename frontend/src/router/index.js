import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LoginView from '../views/LoginView.vue'
import NotFoundView from '../views/NotFoundView.vue'
import AddIpView from '../views/AddIpView.vue'
import EditIpView from '../views/EditIpView.vue'
import MainLayout from '@/layouts/MainLayout.vue'
import MetadataView from '@/views/MetadataView.vue'
import PrintersView from '@/views/PrintersView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: MainLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'home',
          title: 'Početna',
          component: HomeView,
        },
        {
          path: 'add',
          name: 'add-ip',
          title: 'Dodaj IP',
          component: AddIpView,
        },
        {
          path: 'edit/:id',
          name: 'edit-ip',
          title: 'Uredi IP',
          component: EditIpView,
        },
        {
          path: 'metadata',
          name: 'metadata',
          title: 'Metadata',
          component: MetadataView,
        },
        {
          path: 'printers',
          name: 'printers',
          title: 'Printers',
          component: PrintersView,
        },
      ],
    },
    {
      path: '/login',
      name: 'login',
      title: 'Prijavi se',
      component: LoginView,
      meta: { guestOnly: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
    },
  ],
})

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    const exp = payload.exp * 1000
    return Date.now() > exp
  } catch (e) {
    return true
  }
}

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')

  if (to.meta.requiresAuth) {
    if (!token || isTokenExpired(token)) {
      localStorage.removeItem('token')
      return next('/login')
    }
  }

  if (to.meta.guestOnly && token && !isTokenExpired(token)) {
    return next('/')
  }

  return next()
})

export default router
