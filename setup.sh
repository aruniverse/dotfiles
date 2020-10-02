#!/bin/bash

# remove existing vim configuration and copy .vimrc to $HOME directory
rm -rf $HOME/.vimrc $HOME/.vim/
cp ./.vimrc $HOME/.vimrc

# install git
if ! which git > /dev/null; then
    brew install git
fi

# install plugins
mkdir -p $HOME/.vim/bundle
git clone https://github.com/VundleVim/Vundle.vim.git $HOME/.vim/bundle/Vundle.vim && echo -e "\033[32mSuccessfully installed Vundle!\033[0m" || echo -e "\033[31mError installing Vundle :(\033[0m"
git clone https://github.com/scrooloose/nerdtree.git $HOME/.vim/bundle/nerdtree && echo -e "\033[32mSuccessfully installed NERDTree!\033[0m" || echo -e "\033[31mError installing NERDTree :(\033[0m"
git clone https://github.com/airblade/vim-gitgutter.git $HOME/.vim/bundle/vim-gitgutter && echo -e "\033[32mSuccessfully installed GitGutter!\033[0m" || echo -e "\033[31mError installing GitGutter :(\033[0m"
git clone https://github.com/vim-syntastic/syntastic.git $HOME/.vim/bundle/syntastic && echo -e "\033[32mSuccessfully installed Syntastic!\033[0m" || echo -e "\033[31mError installing Syntastic :(\033[0m"
git clone https://github.com/vim-scripts/Conque-GDB.git $HOME/.vim/bundle/Conque-GDB && echo -e "\033[32mSuccessfully installed Conque-GDB!\033[0m" || echo -e "\033[31mError installing Conque-GDB :(\033[0m"
git clone https://github.com/mg979/vim-visual-multi.git $HOME/.vim/bundle/vim-visual-multi && echo -e "\033[32mSuccessfully installed Visual-Multi!\033[0m" || echo -e "\033[31mError installing Visaul-Multi :(\033[0m"
git clone https://github.com/dense-analysis/ale.git $HOME/.vim/bundle/ale && echo -e "\033[32mSuccessfully installed Ale!\033[0m" || echo -e "\033[31mError installing Ale :(\033[0m"
git clone https://github.com/editorconfig/editorconfig-vim.git $HOME/.vim/bundle/editorconfig && echo -e "\033[32mSuccessfully installed EditorConfig!\033[0m" || echo -e "\033[31mError installing EditorConfig :(\033]0m"
vim +PluginInstall +qall

echo -e "\n\033[36mHappy coding... ;-)\033[0m"

