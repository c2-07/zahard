export function customAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'm-auto p-0 bg-transparent backdrop:bg-black/70 backdrop:backdrop-blur-sm border-0 w-[90vw] max-w-md outline-none';
    dialog.innerHTML = `
      <div class="bg-[var(--blue)] text-[var(--paper)] p-6 border border-[var(--border)] flex flex-col gap-6 shadow-2xl">
        <p class="text-sm uppercase tracking-wider leading-relaxed">${message}</p>
        <div class="flex justify-end">
          <button class="btn-primary ok-btn">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    
    const okBtn = dialog.querySelector('.ok-btn') as HTMLButtonElement;
    
    // Handle cancel via Escape key
    dialog.addEventListener('cancel', () => {
      dialog.remove();
      resolve();
    });

    okBtn.addEventListener('click', () => {
      dialog.close();
      dialog.remove();
      resolve();
    });
    
    dialog.showModal();
  });
}

export function customConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'm-auto p-0 bg-transparent backdrop:bg-black/70 backdrop:backdrop-blur-sm border-0 w-[90vw] max-w-md outline-none';
    dialog.innerHTML = `
      <div class="bg-[var(--blue)] text-[var(--paper)] p-6 border border-[var(--border)] flex flex-col gap-6 shadow-2xl">
        <p class="text-sm uppercase tracking-wider leading-relaxed">${message}</p>
        <div class="flex justify-end gap-3 mt-2">
          <button class="btn-ghost cancel-btn">Cancel</button>
          <button class="btn-primary confirm-btn">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    
    const cancelBtn = dialog.querySelector('.cancel-btn') as HTMLButtonElement;
    const confirmBtn = dialog.querySelector('.confirm-btn') as HTMLButtonElement;
    
    // Handle cancel via Escape key
    dialog.addEventListener('cancel', () => {
      dialog.remove();
      resolve(false);
    });

    cancelBtn.addEventListener('click', () => {
      dialog.close();
      dialog.remove();
      resolve(false);
    });
    
    confirmBtn.addEventListener('click', () => {
      dialog.close();
      dialog.remove();
      resolve(true);
    });
    
    dialog.showModal();
  });
}
