import { TourProvider } from "@reactour/tour";

export default function AppTourProvider({ steps, children }) {
  return (
    <TourProvider
      steps={steps}
      showBadge={false}
      showCloseButton
      styles={{
        popover: (base) => ({
          ...base,
          borderRadius: 10
        })
      }}
    >
      {children}
    </TourProvider>
  );
}