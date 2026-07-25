import SwarmLaunchWizardModal from '../../control-room/SwarmLaunchWizardModal';
// SwarmLaunchEntryPoint — renders the SwarmLaunchWizardModal when open.
// Extracted from TerminalWorkspacesManager.jsx.

function SwarmLaunchEntryPoint({
  open,
  catalog,
  preview,
  currentStep,
  onClose,
  onStepChange,
  onDraftChange,
  onLaunch,
}) {
  if (!open) return null;

  return (
    <SwarmLaunchWizardModal
      key="terminal-swarm-launch-wizard"
      open={open}
      catalog={catalog}
      preview={preview}
      currentStep={currentStep}
      onClose={onClose}
      onStepChange={onStepChange}
      onDraftChange={onDraftChange}
      onLaunch={onLaunch}
    />
  );
}

export default SwarmLaunchEntryPoint;
