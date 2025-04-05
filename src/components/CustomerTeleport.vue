<template>
  <div>
    <slot></slot>
  </div>
</template>

<script>
export default {
  name: "teleport",
  props: {
    to: {
      type: String,
      required: true,
    },
  },
  watch: {
    to() {
      const toEl = document.querySelector("#" + this.to);
      console.log(toEl, this.to, "????");

      if (toEl) {
        toEl.appendChild(this.$el);
      }
    },
  },
  mounted() {
    const toEl = document.querySelector("#" + this.to);
    console.log(toEl, this.to, "????");

    if (toEl) {
      toEl.appendChild(this.$el);
    }
  },
  destroyed() {
    const toEl = document.querySelector(this.to);
    if (toEl) {
      toEl.removeChild(this.$el);
    }
  },
};
</script>
