<script lang="ts">
   export let label: string
   export let isSelected: boolean
   export let isHeld: boolean
   export let isBound: boolean
   let className: string
   $: {
      className = "button"
      if (isSelected) className += " isSelected"
      if (isHeld) className += " isHeld"
      if (isBound) className += " isBound"
   }
</script>

<div class={className} on:mousedown>
   <div class="label">{label}</div>
</div>
