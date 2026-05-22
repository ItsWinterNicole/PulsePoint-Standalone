import { Bookmark, MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function SectionButtons({ sections, activeTab, onSelect, closeOnSelect = false }) {
  return (
    <div className="space-y-1">
      {sections.map((section) => {
        const button = (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section)}
            className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              section.tab === activeTab || (!section.tab && section.id.includes("summary"))
                ? "border-primary/35 bg-primary/10 text-foreground"
                : "border-transparent bg-muted/40 text-muted-foreground hover:border-primary/25 hover:text-foreground"
            }`}
          >
            <span className="block font-medium">{section.label}</span>
            {section.group && <span className="block text-xs text-muted-foreground">{section.group}</span>}
          </button>
        );

        return closeOnSelect ? (
          <SheetClose key={section.id} asChild>
            {button}
          </SheetClose>
        ) : button;
      })}
    </div>
  );
}

export default function SessionSectionNavigator({ sections, activeTab, onSelect }) {
  return (
    <>
      <aside className="fixed right-4 top-28 z-30 hidden w-52 rounded-xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur xl:block">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <Bookmark className="h-3.5 w-3.5" />
          Session Sections
        </div>
        <SectionButtons sections={sections} activeTab={activeTab} onSelect={onSelect} />
      </aside>

      <div className="fixed bottom-5 left-4 z-40 xl:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button className="h-11 rounded-full px-4 shadow-lg">
              <MapPinned className="h-4 w-4" />
              Jump
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[78vh] overflow-y-auto rounded-t-2xl px-4 pb-6 pt-5">
            <SheetHeader className="pr-8 text-left">
              <SheetTitle>Jump to section</SheetTitle>
              <SheetDescription>Move through this session without losing the thread.</SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              <SectionButtons sections={sections} activeTab={activeTab} onSelect={onSelect} closeOnSelect />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
