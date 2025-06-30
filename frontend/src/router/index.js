import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LoginView from '../views/LoginView.vue'
import NotFoundView from '../views/NotFoundView.vue'
import AddIpView from '../views/AddIpView.vue'
import EditIpView from '../views/EditIpView.vue'
import MainLayout from '@/layouts/MainLayout.vue'

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

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')

  if (to.meta.requiresAuth && !token) {
    return next('/login')
  }

  if (to.meta.guestOnly && token) {
    return next('/')
  }

  return next()
})

export default router
