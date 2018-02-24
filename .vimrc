set nocompatible
filetype off

" set the runtime path to include Vundle
set rtp+=$HOME/.vim/bundle/Vundle.vim/
call vundle#begin('$HOME/.vim/bundle/')
" let Vundle manage Vundle
Plugin 'VundleVim/Vundle.vim'
" add NERDTree to show dirs
Plugin 'scrooloose/nerdtree'
" shows git status in the gutter
Plugin 'airblade/vim-gitgutter'
" suggests syntax
" Plugin 'vim-syntastic/syntastic'

" All of your Plugins must be added before the following line
call vundle#end()            " required
filetype plugin indent on    " required

syntax enable		" enable syntax highlighting
set tabstop=4		" number of visual spaces per TAB
set softtabstop=4	" number of spaces in tab when editing
set shiftwidth=4	" indent corresponding to one tab
set expandtab		" tabs are spaces
set number		    " show line numbers
set showcmd		    " show command in bottom bar
set cursorline		" highlight current line
set showmatch		" highlight match [{()}]

nnoremap B ^
nnoremap E $


" colorscheme brogrammer

" always open up vim with NERDTree open
autocmd VimEnter * NERDTree
" always start off in the main windows
autocmd VimEnter * wincmd p
autocmd bufenter * if (winnr("$") == 1 && exists("b:NERDTree") && b:NERDTree.isTabTree()) | q | endif
map <C-n> : NERDTreeToggle<CR>


set statusline=bot
highlight Comment ctermfg=LightBlue
highlight ExtraWhitespace ctermbg=red guibg=red

" use actual tab chars in Makefile
autocmd Filetype make set tabstop=8 shiftwidth=8 softtabstop=0 noexpandtab
autocmd Filetype h setlocal expandtab shiftwidth=4 softtabstop=4
autocmd Filetype c setlocal expandtab shiftwidth=4 softtabstop=4
autocmd Filetype cpp setlocal expandtab shiftwidth=4 softtabstop=4

" Enable Folding {{{
set foldenable
set foldlevelstart=10
set foldnestmax=10
set foldmethod=indent
"}}}

" use space for folding
nnoremap <space> za

" use ctrl+space to do autocompletion in insert mode
inoremap <Nul> <C-p>
" use ctrl+space to do spelling suggestion in normal mode
nnoremap <Nul> z=

" Surround anything selected with the given mathich quotes, bracket, etc
map '' xi'<Esc>pa'<Esc>
map "" xi"<Esc>pa"<Esc>
map () xi(<Esc>pa)<Esc>
map [] xi[<Esc>pa]<Esc>
map {} xi{<Esc>pa}<Esc>


" Folding for this file {{{
set modelines=1
" }}}







