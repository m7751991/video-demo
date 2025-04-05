import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import VideoList from "../views/VideoList.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView,
    },
    {
      path: "/list",
      name: "list",
      component: VideoList,
    },
  ],
});

export default router;
