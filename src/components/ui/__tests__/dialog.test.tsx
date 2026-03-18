import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../dialog";

describe("Dialog", () => {
  it("moves focus to the first input on open and restores focus to the trigger on close", async () => {
    const user = userEvent.setup();

    render(
      <Dialog>
        <DialogTrigger>Abrir modal</DialogTrigger>
        <DialogContent>
          <DialogTitle>Editar item</DialogTitle>
          <DialogDescription>Teste de foco</DialogDescription>
          <input aria-label="Primeiro campo" />
          <button type="button">Salvar</button>
        </DialogContent>
      </Dialog>,
    );

    const trigger = screen.getByRole("button", { name: "Abrir modal" });
    await user.click(trigger);

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("textbox", { name: "Primeiro campo" }),
      );
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
