document.addEventListener('DOMContentLoaded', () => {
  const tutorialModal = document.getElementById('tutorial-modal');
  const closeBtn = document.getElementById('close-tutorial-modal');
  const prevBtn = document.getElementById('prev-step');
  const nextBtn = document.getElementById('next-step');
  const stepIndicator = document.getElementById('step-indicator');
  const dontShowAgainBtn = document.getElementById('dont-show-again');
  const tutorialSteps = document.querySelectorAll('.tutorial-step');
  let currentStep = 0;

  function showStep(index) {
    tutorialSteps.forEach((step, i) => {
      step.style.display = i === index ? 'block' : 'none';
    });
    stepIndicator.textContent = `${index + 1} / ${tutorialSteps.length}`;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === tutorialSteps.length - 1;
  }

  function openTutorial() {
    tutorialModal.classList.remove('hidden');
    showStep(currentStep);
  }

  function closeTutorial() {
    tutorialModal.classList.add('hidden');
  }

  closeBtn.addEventListener('click', () => {
    closeTutorial();
  });

  prevBtn.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep--;
      showStep(currentStep);
    }
  });

  nextBtn.addEventListener('click', () => {
    if (currentStep < tutorialSteps.length - 1) {
      currentStep++;
      showStep(currentStep);
    }
  });

  dontShowAgainBtn.addEventListener('click', () => {
    localStorage.setItem('hideTutorial', 'true');
    closeTutorial();
  });

  // Show tutorial if not disabled
  if (!localStorage.getItem('hideTutorial')) {
    openTutorial();
  }

  // Add event listener to help button to open tutorial
  const helpButton = document.getElementById('help-button');
  if (helpButton) {
    helpButton.addEventListener('click', () => {
      currentStep = 0;
      openTutorial();
    });
  }
});
