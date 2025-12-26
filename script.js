    //Script for Word Cutting
    
    function $(id) { return document.getElementById(id); }

    // Reads checkbox state by id
    function isChecked(id) { return $(id).checked; }

    //word counting
    function countWords(text) {
      // If null/empty, return 0 quickly
      if (!text) return 0;

      // Trim ends, split on one-or-more whitespace, count real tokens
      var tokens = text.trim().split(/\s+/);
      return tokens.filter(Boolean).length;
    }
    // Line-level detectors (used while scanning the input line by line)

    // Matches caption lines
    function isFigureCaptionLine(line) {
      return /^(figure|fig\.|table|diagram)\s*\d*\s*:/i.test(line);
    }

    // Matches common page number formats:
    function isPageNumberLine(line) {
      if (/^page\s*\d+(\s*of\s*\d+)?$/i.test(line)) return true;
      if (/^\d+$/.test(line)) return true;
      if (/^\d+\/\d+$/.test(line)) return true;
      if (/^[-\s]*\d+[-\s]*$/.test(line)) return true;
      return false;
    }

    // Rough approximation: if there's "=" and it’s short enough, treat as an equation line
    function looksLikeShortEquation(line) {
      if (!/=/.test(line)) return false;

      var lengthOk = line.length <= 80; // short character length
      var wordsOk  = line.split(/\s+/).filter(Boolean).length <= 10; // or short word count

      // If either test passes, we call it equation-ish
      return lengthOk || wordsOk;
    }

    // Removes inline references inside running text:
    function removeInlineFigureRefs(text) {
      return text.replace(/\b(Figure|Fig\.|Table)\s*\d+\b/g, " ");
    }

    // Section heading detection (References / Appendix / Abstract / Contents)

    // Returns a short key if a line looks like a section heading, otherwise null
    function getSectionHeading(trimmed) {
      // Note: allows optional numbering like "8.2 References"
      if (/^\s*(?:\d+(?:\.\d+)*)?\s*(references|reference\s+list|bibliography)\s*$/i.test(trimmed)) return "ref";
      if (/^\s*(?:\d+(?:\.\d+)*)?\s*(appendix|appendices)\s*$/i.test(trimmed)) return "app";
      if (/^\s*(?:\d+(?:\.\d+)*)?\s*abstract\s*$/i.test(trimmed)) return "abs";
      if (/^\s*(?:\d+(?:\.\d+)*)?\s*(contents|table\s+of\s+contents)\s*$/i.test(trimmed)) return "contents";
      return null;
    }

    // Units / variable token lists (used during token-level filtering)

    // Common units to drop
    var UNIT_TOKENS = new Set([
      "m","km","cm","mm","um","nm",
      "s","ms","min","h","hr",
      "kg","g","mg","ug","µg",
      "mol","mmol",
      "l","ml","kl",
      "n","kn",
      "j","kj",
      "w","kw",
      "v",
      "pa","kpa","mpa",
      "hz","khz","mhz",
      "ohm","ω",
      "c","k"
    ]);

    // Optional: treat single letters (b..z) as “variables” and remove them
    // (a is handled specially because “a” is a real word)
    var SINGLE_LETTERS = new Set("bcdefghijklmnopqrstuvwxyz".split(""));

    // Decide if a token should be dropped as a unit/variable
    function shouldDropUnitToken(token) {
      // Strip everything except letters and a couple of unit symbols (µ, ω)
      var clean = token.replace(/[^A-Za-zµω]/g, "");
      if (!clean) return false;

      var lower = clean.toLowerCase();

      // Keep the word "a" 
      if (lower === "a") return false;

      // Remove known units
      if (UNIT_TOKENS.has(lower)) return true;

      // Remove single-letter variables ONLY if it’s exactly one letter
      if (clean.length === 1 && SINGLE_LETTERS.has(lower)) return true;

      return false;
    }

    // Protect + restore "(Figure 1)" style refs before citation stripping (dont remove inline references to figures lol- idk why it was doing that)

    // Temporarily replace "(Figure 1)" with placeholders so citation regex doesn't remove them.
    function protectFigureRefs(text) {
      var placeholders = [];

      var out = text.replace(/\(\s*(Figure|Fig\.|Table)\s*\d+\s*\)/gi, function(match) {
        var key = "__FIGREF__" + placeholders.length + "__";
        placeholders.push({ key: key, value: match });
        return key;
      });

      // Return both the modified text and the placeholder map
      return { text: out, placeholders: placeholders };
    }

    // Put all the "(Figure 1)" placeholders back into the final text
    function restoreFigureRefs(text, placeholders) {
      for (var i = 0; i < placeholders.length; i++) {
        var ph = placeholders[i];
        text = text.replaceAll(ph.key, ph.value);
      }
      return text;
    }

    // Inline removals (citations, bracket equations, quotes)
    function stripCitations(text) {
      text = text.replace(/\(((?!\s*(Figure|Fig\.|Table)\b)[^)]*?\d{1,4}[^)]*?)\)/gi, " ");
      text = text.replace(/\(((?!\s*(Figure|Fig\.|Table)\b)[^)]*?n\.?\s*d\.?[^)]*?)\)/gi, " ");
      text = text.replace(/\[[^\]]*?\d+[^\]]*?\]/g, " ");
      return text;
    }

    // Removes equations that are inside brackets/parentheses
    function stripBracketEquations(text) {
      text = text.replace(/\(([^)]*=[^)]*?)\)/g, " ");
      text = text.replace(/\[([^]]*=[^]]*?)\]/g, " ");
      return text;
    }

    // Removes single-line quoted text: 
    function stripInlineQuotes(text) {
      text = text.replace(/"[^"\n]*"/g, " ");
      text = text.replace(/'[^'\n]*'/g, " ");
      return text;
    }

    // Final cleanup: squash extra spaces/newlines
    function tidy(text) {
      text = text.replace(/[ \t]+/g, " ");  // multiple spaces/tabs -> one space
      text = text.replace(/ \n/g, "\n");    // space before newline -> remove
      text = text.replace(/\n{3,}/g, "\n\n"); // 3+ blank lines -> 2
      text = text.replace(/^\s+|\s+$/g, "");  // trim start/end
      return text;
    }

    // Main processing 
    function processText() {
      // Read input and update original word count
      var raw = $("inputText").value || "";
      $("originalCount").textContent = countWords(raw);

      // Split input into lines so we can remove whole lines (captions/page numbers/etc)
      var lines = raw.split(/\r?\n/);

      // If title removal is enabled, blank out the first line (because we think this is the title)
      if (isChecked("excludeTitle") && lines.length) {
        lines[0] = "";
      }

      // Collect lines that survive the line-based filters
      var outLines = [];

      // Tracks whether we are currently inside a section (ref/app/abs/contents)
      var section = null;

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var trimmed = line.trim();

        // If the line looks like a section heading, update the section state
        var heading = getSectionHeading(trimmed);
        if (heading) {
          section = heading;

          // Decide if this whole section should be excluded
          var excluded =
            (section === "ref" && isChecked("excludeReferences")) ||
            (section === "app" && isChecked("excludeAppendices")) ||
            (section === "abs" && isChecked("excludeAbstract")) ||
            (section === "contents" && isChecked("excludeContents"));

          // Only keep the heading line if the section is not excluded
          if (!excluded) outLines.push(line);
          continue;
        }

        // Contents section special case:
        // Many contents pages end at a blank line, so we stop skipping when we hit one.
        if (section === "contents" && isChecked("excludeContents")) {
          if (trimmed === "") {
            section = null;       // exit contents mode
            outLines.push(line);  // keep the blank line as a separator
          }
          continue; // skip everything else while in contents
        }

        // Skip entire section bodies if that section is excluded
        if (section === "ref" && isChecked("excludeReferences")) continue;
        if (section === "app" && isChecked("excludeAppendices")) continue;
        if (section === "abs" && isChecked("excludeAbstract")) continue;

        // Per-line filters
        if (isChecked("excludePageNumbers") && isPageNumberLine(trimmed)) continue;
        if (isChecked("excludeFigureCaptions") && isFigureCaptionLine(trimmed)) continue;
        if (isChecked("excludeEquations") && looksLikeShortEquation(trimmed)) continue;

        // If we didn’t skip it, keep the line
        outLines.push(line);
      }

      // Convert surviving lines back into one text blob
      var text = outLines.join("\n");

      // Protect "(Figure 1)" etc so previous removals dont remove them
      var protectedPack = protectFigureRefs(text);
      text = protectedPack.text;

      // Inline filters (string-wide)
      if (isChecked("excludeCitations")) text = stripCitations(text);
      if (isChecked("excludeEquations")) text = stripBracketEquations(text);
      if (isChecked("excludeInlineFigureRefs")) text = removeInlineFigureRefs(text);
      if (isChecked("excludeQuotes")) text = stripInlineQuotes(text);

      // Token-ish pass:
      // Split by whitespace but keep the whitespace tokens (so spacing stays natural)
      var parts = text.split(/(\s+)/);
      var finalParts = [];

      for (var p = 0; p < parts.length; p++) {
        var t = parts[p];

        // If it’s pure whitespace, keep it as-is
        if (/^\s+$/.test(t)) { finalParts.push(t); continue; }

        // Unit/variable removal
        if (isChecked("excludeUnits") && shouldDropUnitToken(t)) continue;

        // Remove anything containing digits if enabled (e.g., "2020", "H2O", "2nd")
        if (isChecked("excludeNumbers") && /\d/.test(t)) continue;

        // Remove tokens with no letters (punctuation-only chunks)
        if (isChecked("excludeSymbols") && !/[A-Za-z]/.test(t)) continue;

        // Otherwise keep token
        finalParts.push(t);
      }

      // Rebuild final string
      var cleaned = finalParts.join("");

      // Restore protected "(Figure 1)" placeholders
      cleaned = restoreFigureRefs(cleaned, protectedPack.placeholders);

      // Final spacing cleanup
      cleaned = tidy(cleaned);

      // Write output and update filtered word count
      $("outputText").value = cleaned;
      $("filteredCount").textContent = countWords(cleaned);
    }

    // Debounce helper (prevents running processText too often on large pastes)
    function debounce(fn, ms) {
      var t;
      return function () {
        clearTimeout(t);
        t = setTimeout(fn, ms);
      };
    }

    // Wire up UI once the page loads
    window.onload = function () {
      // Manual process button
      $("processBtn").onclick = processText;

      // Auto-process while typing/pasting (debounced so it’s smoother)
      $("inputText").oninput  = debounce(processText, 60);

      // Copy output text to clipboard
      $("copyBtn").onclick = function () {
        var txt = $("outputText").value || "";
        if (!txt) return;

        // Modern clipboard API if available
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(function () {
            // Quick feedback so user knows it copied
            var btn = $("copyBtn");
            var old = btn.textContent;
            btn.textContent = "Copied!";
            setTimeout(function () { btn.textContent = old; }, 900);
          });
        } else {
          // Fallback: select the output so user can Ctrl+C manually
          $("outputText").focus();
          $("outputText").select();
        }
      };

      // Run once on load so counts/output start in a clean state
      processText();
    };