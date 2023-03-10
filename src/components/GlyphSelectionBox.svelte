<script lang="ts">
   import { SymbolKind } from "~/shared/circuit"
   type GlyphKind = "auto" | null | SymbolKind

   export let glyphsToShow: GlyphKind[]
   export let glyphsToHighlight: Set<GlyphKind>
   export let glyphSelected: (kind: GlyphKind) => void
</script>

<div class="glyphSelectionBox">
   {#each glyphsToShow as kind}
      {@const kindText =
         kind === "auto"
            ? "auto"
            : kind === null
            ? "nothing"
            : kind.fileName.replace(".svg", "")}
      {@const highlightClass = glyphsToHighlight.has(kind)
         ? glyphsToHighlight.size === 1
            ? "uniqueHighlight"
            : "multiHighlight"
         : ""}
      <div
         class="glyphSelectionItem {highlightClass}"
         on:click={() => glyphSelected(kind)}
      >
         <div class="glyphLabel">{kindText}</div>
         {#if kind instanceof SymbolKind}
            <svg
               class="glyphImage"
               viewBox="{kind.svgBox.x.low} {kind.svgBox.y
                  .low} {kind.svgBox.width()} {kind.svgBox.height()}"
            >
               <use href="#{kind.fileName}" />
            </svg>
         {:else}
            <div class="glyphImage" />
         {/if}
      </div>
   {/each}
</div>
