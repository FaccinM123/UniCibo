import { createRouter, createWebHistory } from 'vue-router'
import FeedView from '@/views/FeedView.vue'
import RecipeDetailView from '@/views/RecipeDetailView.vue'
import NewRecipeView from '@/views/NewRecipeView.vue'
import GroupsView from '@/views/GroupsView.vue'
import GroupDetailsView from '@/views/GroupDetailsView.vue'
import PostManagementView from '@/views/PostManagementView.vue'
import MemberView from '@/views/MemberView.vue'
import HowItWorksView from '@/views/HowItWorksView.vue'

const routes = [
  { path: '/', name: 'feed', component: FeedView },
  { path: '/gruppi/:groupId', name: 'group-feed', component: FeedView, props: true },
  { path: '/gruppi/:groupId/dettagli', name: 'group-details', component: GroupDetailsView, props: true, meta: { label: 'Dettagli gruppo' } },
  { path: '/ricetta/:id', name: 'recipe-detail', component: RecipeDetailView, props: true, meta: { label: 'Ricetta' } },
  { path: '/nuova-ricetta', name: 'new-recipe', component: NewRecipeView, meta: { label: 'Nuova ricetta' } },
  { path: '/gestione-post', name: 'post-management', component: PostManagementView, meta: { label: 'Gestione post' } },
  { path: '/membro/:memberId', name: 'member', component: MemberView, props: true },
  { path: '/gruppi', name: 'groups', component: GroupsView, meta: { label: 'Gruppi' } },
  { path: '/come-funziona', name: 'how-it-works', component: HowItWorksView, meta: { label: 'Come funziona' } }
]

export default createRouter({
  history: createWebHistory(),
  routes
})
