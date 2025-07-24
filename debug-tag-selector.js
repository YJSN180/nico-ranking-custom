// Debug script for tag selector issue
// Run this in browser console while on a custom genre page

console.log('=== Debug Tag Selector Issue ===');

// 1. Check localStorage for custom rankings
const storageData = localStorage.getItem('custom-rankings');
console.log('1. LocalStorage custom-rankings:', storageData);

if (storageData) {
  try {
    const parsed = JSON.parse(storageData);
    console.log('1.1. Parsed storage data:', parsed);
    console.log('1.2. Rankings count:', parsed.rankings?.length || 0);
    console.log('1.3. Selected ID:', parsed.selectedId);
  } catch (e) {
    console.error('1.4. Failed to parse storage data:', e);
  }
}

// 2. Check URL parameters
const urlParams = new URLSearchParams(window.location.search);
console.log('2. URL parameters:');
console.log('   - genre:', urlParams.get('genre'));
console.log('   - tag:', urlParams.get('tag'));
console.log('   - ranking:', urlParams.get('ranking'));

// 3. Check DOM elements in TagSelector
console.log('3. DOM inspection:');

// Check if the custom ranking section exists
const customRankingContainer = document.querySelector('[class*="tagSelectorContainer"]');
console.log('3.1. Tag selector container found:', !!customRankingContainer);

// Check for "選択中" text
const selectedText = document.querySelector('[class*="selectedTag"]');
console.log('3.2. Selected tag element found:', !!selectedText);
if (selectedText) {
  console.log('3.3. Selected tag text:', selectedText.textContent);
}

// Check for the button container
const buttonContainer = document.querySelector('[class*="buttonContainer"][class*="tagScrollContainer"]');
console.log('3.4. Button container found:', !!buttonContainer);
if (buttonContainer) {
  console.log('3.5. Button container children count:', buttonContainer.children.length);
  console.log('3.6. Button container HTML:', buttonContainer.innerHTML);
}

// Check for create button specifically
const createButton = document.querySelector('button[class*="createButton"]');
console.log('3.7. Create button found:', !!createButton);
if (createButton) {
  console.log('3.8. Create button text:', createButton.textContent);
  console.log('3.9. Create button styles:', window.getComputedStyle(createButton).display);
  console.log('3.10. Create button visibility:', window.getComputedStyle(createButton).visibility);
}

// Check for any custom ranking item buttons
const customButtons = document.querySelectorAll('[class*="customRankingItem"]');
console.log('3.11. Custom ranking items found:', customButtons.length);

// 4. Check React component state (if available)
console.log('4. React state inspection:');
if (window.React) {
  // Try to find React fiber
  const container = document.querySelector('#__next');
  if (container && container._reactInternalInstance) {
    console.log('4.1. React detected, but fiber inspection is complex');
  }
}

// 5. Check CSS styles that might hide elements
console.log('5. CSS style checks:');
const styleSheets = Array.from(document.styleSheets);
styleSheets.forEach((sheet, index) => {
  try {
    const rules = Array.from(sheet.cssRules || sheet.rules || []);
    const hidingRules = rules.filter(rule => 
      rule.style && (
        rule.style.display === 'none' ||
        rule.style.visibility === 'hidden' ||
        rule.style.opacity === '0'
      )
    );
    if (hidingRules.length > 0) {
      console.log(`5.${index + 1}. Potentially hiding CSS rules found:`, hidingRules);
    }
  } catch (e) {
    // Cross-origin stylesheets may throw errors
  }
});

// 6. Check if the issue is with window not being defined (SSR)
console.log('6. Window/SSR checks:');
console.log('6.1. typeof window:', typeof window);
console.log('6.2. window.location.href:', window.location.href);

console.log('=== Debug Complete ===');
console.log('Please share this output to help identify the issue.');