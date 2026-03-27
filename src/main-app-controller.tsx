import React from "react";
import { BrandProfileController } from "@/controllers/BrandProfileController";
import { CampaignController } from "@/controllers/CampaignController";
import { GalleryController } from "@/controllers/GalleryController";
import { MainAppContent } from "@/controllers/main-app-content";
import { TournamentController } from "@/controllers/TournamentController";

export type ViewType =
  | "campaign"
  | "campaigns"
  | "carousels"
  | "flyer"
  | "gallery"
  | "calendar"
  | "playground"
  | "image-playground"
  | "integrations";

interface MainAppControllerProps {
  routeView: ViewType;
}

export function MainAppController({ routeView }: MainAppControllerProps) {
  return (
    <BrandProfileController routeView={routeView}>
      <CampaignController>
        <GalleryController>
          <TournamentController>
            <MainAppContent />
          </TournamentController>
        </GalleryController>
      </CampaignController>
    </BrandProfileController>
  );
}
