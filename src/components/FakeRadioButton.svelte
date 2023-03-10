<script lang="ts">
   export let label: string
   export let checked: boolean
   export let onClick: () => void
</script>

<div class="radioOption" on:click={onClick}>
   <svg width="14" height="14" viewBox="-7 -7 14 14">
      <circle class="radioOutline" cx="0" cy="0" r="6" />
      {#if checked}
         <circle class="radioOutlineCheck" cx="0" cy="0" r="6" />
         <circle class="radioFill" cx="0" cy="0" r="4" />
      {/if}
   </svg>
   <span class="label">{label}</span>
</div>
