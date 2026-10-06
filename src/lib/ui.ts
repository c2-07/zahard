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

export function promptExpiration(): Promise<{ type: 'hours' | 'days' | 'months' | 'date', value: string } | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'm-auto p-0 bg-transparent backdrop:bg-black/70 backdrop:backdrop-blur-sm border-0 w-[90vw] max-w-md outline-none';
    dialog.innerHTML = `
      <div class="bg-[var(--blue)] text-[var(--paper)] p-6 border border-[var(--border)] flex flex-col gap-6 shadow-2xl">
        <p class="text-sm uppercase tracking-wider font-bold">Set Expiration</p>
        
        <div class="space-y-4">
          <div>
            <label class="block text-[10px] uppercase opacity-80 mb-2 tracking-widest">Add Duration</label>
            <div class="flex gap-2">
              <input type="number" id="exp-val" class="field flex-1 !py-1.5" min="1" value="1" />
              <select id="exp-type" class="field !w-auto cursor-pointer !py-1.5">
                <option value="hours">Hours</option>
                <option value="days" selected>Days</option>
                <option value="months">Months</option>
              </select>
            </div>
          </div>
          
          <div class="relative flex items-center gap-4 py-2">
             <div class="flex-1 border-t border-[var(--border)]"></div>
             <span class="text-[10px] uppercase tracking-widest opacity-60">OR</span>
             <div class="flex-1 border-t border-[var(--border)]"></div>
          </div>
          
          <div>
            <label class="block text-[10px] uppercase opacity-80 mb-2 tracking-widest">Set Exact Date & Time</label>
            <input type="datetime-local" id="exp-date" class="field !py-1.5" />
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-4">
          <button class="btn-ghost cancel-btn !px-3 !py-1.5 !text-[10px]">Cancel</button>
          <button class="btn-primary confirm-btn !px-3 !py-1.5 !text-[10px]">Set Expiry</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    
    const cancelBtn = dialog.querySelector('.cancel-btn') as HTMLButtonElement;
    const confirmBtn = dialog.querySelector('.confirm-btn') as HTMLButtonElement;
    const valInput = dialog.querySelector('#exp-val') as HTMLInputElement;
    const typeInput = dialog.querySelector('#exp-type') as HTMLSelectElement;
    const dateInput = dialog.querySelector('#exp-date') as HTMLInputElement;
    
    // Clear duration if date is picked
    dateInput.addEventListener('input', () => {
      if (dateInput.value) valInput.value = '';
    });
    
    // Clear date if duration is typed
    valInput.addEventListener('input', () => {
      if (valInput.value) dateInput.value = '';
    });

    dialog.addEventListener('cancel', () => {
      dialog.remove();
      resolve(null);
    });

    cancelBtn.addEventListener('click', () => {
      dialog.close();
      dialog.remove();
      resolve(null);
    });
    
    confirmBtn.addEventListener('click', () => {
      dialog.close();
      dialog.remove();
      if (dateInput.value) {
        resolve({ type: 'date', value: dateInput.value });
      } else {
        resolve({ type: typeInput.value as any, value: valInput.value });
      }
    });
    
    dialog.showModal();
  });
}
